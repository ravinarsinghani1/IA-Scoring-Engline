// Local development / self-hosted entry point. Ensures the schema exists, then
// starts a long-running HTTP listener. On Vercel this file is unused — the
// serverless function (api/index.mjs) imports the app directly and Vercel owns
// the HTTP layer.

import app from './app.js';
import { ensureSchema } from './db/ensureSchema.js';

const PORT = process.env.PORT || 4000;

ensureSchema()
  .then(() => {
    app.listen(PORT, () => {
      console.log(`✓ IA scoring server listening on http://localhost:${PORT}`);
    });
  })
  .catch((err) => {
    console.error('✗ Failed to initialize database schema:', err.message);
    process.exit(1);
  });
