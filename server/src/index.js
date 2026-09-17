// Local development / self-hosted entry point. Ensures the schema exists, then
// starts a long-running HTTP listener. On Vercel this file is unused — the
// serverless function (api/index.mjs) imports the app directly and Vercel owns
// the HTTP layer.

import app from './app.js';
import { ensureSchema } from './db/ensureSchema.js';

const PORT = process.env.PORT || 4000;

// RESILIENCE — a transient DB blip at boot (Supabase pausing/restarting, a
// brief network hiccup) must not fail an otherwise-healthy deploy. This used
// to call process.exit(1) after a SINGLE failed attempt — confirmed as the
// exact cause of a real failed deploy (Render's build log: "Failed to
// initialize database schema: (ENOTFOUND) ... postgres.<ref> not found",
// repeated across Render's own 3 container-restart attempts, each exiting
// status 1) for a commit that touched no DB code at all — Supabase was
// simply paused at that moment. Retrying with backoff before giving up gives
// a transient outage a real chance to clear within the deploy's own boot
// window, while still failing loudly (and still exiting) if the DB is
// genuinely, persistently unreachable.
//
// Deliberately NOT "start the HTTP server without a DB" — every data route
// in this app assumes a live schema; serving traffic before that's true
// would need auditing each one, a bigger change than today's ask. This only
// widens how long boot is willing to wait before giving up.
const SCHEMA_RETRY_ATTEMPTS = Number(process.env.SCHEMA_RETRY_ATTEMPTS ?? 5);
const SCHEMA_RETRY_BASE_MS = Number(process.env.SCHEMA_RETRY_BASE_MS ?? 2000);

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function ensureSchemaWithRetry() {
  for (let attempt = 1; attempt <= SCHEMA_RETRY_ATTEMPTS; attempt++) {
    try {
      await ensureSchema();
      return;
    } catch (err) {
      const isLastAttempt = attempt === SCHEMA_RETRY_ATTEMPTS;
      console.error(`✗ Schema setup attempt ${attempt}/${SCHEMA_RETRY_ATTEMPTS} failed: ${err.message}`);
      if (isLastAttempt) throw err;
      const delayMs = SCHEMA_RETRY_BASE_MS * 2 ** (attempt - 1); // 2s, 4s, 8s, 16s by default — ~30s total before the final attempt
      console.error(`  retrying in ${Math.round(delayMs / 1000)}s…`);
      await sleep(delayMs);
    }
  }
}

ensureSchemaWithRetry()
  .then(() => {
    app.listen(PORT, () => {
      console.log(`✓ IA scoring server listening on http://localhost:${PORT}`);
    });
  })
  .catch((err) => {
    console.error(`✗ Failed to initialize database schema after ${SCHEMA_RETRY_ATTEMPTS} attempts:`, err.message);
    process.exit(1);
  });
