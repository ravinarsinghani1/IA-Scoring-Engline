# Deploying to Vercel + Supabase

The app runs on Vercel as:
- **Static frontend** — the Vite build (`client/dist`) served as static files.
- **One serverless function** — `api/index.mjs`, which is the Express app. All
  `/api/*` requests are rewritten to it (see `vercel.json`).
- **Supabase** for state — Postgres (data) and Storage (uploaded PDFs).

Local dev is unchanged: `npm run dev` still runs the Express server
(`server/src/index.js`) + Vite together.

## 1. Environment variables

Set these in **Vercel → Project → Settings → Environment Variables** (and, for
local dev, in `server/.env` — see `server/.env.example`):

| Variable | Required | Where to get it |
|---|---|---|
| `ANTHROPIC_API_KEY` | yes | console.anthropic.com |
| `DATABASE_URL` | yes | Supabase → Connect → **Transaction pooler** (port 6543) |
| `SUPABASE_URL` | for PDF uploads | Supabase → Project Settings → API → Project URL |
| `SUPABASE_SERVICE_ROLE_KEY` | for PDF uploads | Supabase → Project Settings → API → **service_role** secret |
| `SCORING_MODEL` | optional | `claude-sonnet-5` (default) or `claude-opus-4-8` |
| `SUPABASE_STORAGE_BUCKET` | optional | defaults to `drafts` (auto-created, private) |

> The `service_role` key bypasses row-level security — it is **server-side
> only**. Never expose it to the frontend. It is safe in Vercel env vars and in
> the git-ignored `server/.env`.

## 2. One-time database migration

Create the tables in Supabase (run locally with `DATABASE_URL` set, or as a
deploy step):

```bash
cd server && npm run migrate
```

The serverless function does **not** run schema setup on cold start — migrate
explicitly whenever the schema changes.

## 3. Deploy

1. Vercel → **Add New → Project → Import** the GitHub repo.
2. Leave build settings to `vercel.json` (it sets install/build/output).
3. Add the environment variables above.
4. Deploy.

## Known constraints (read before relying on it)

1. **Serverless request-body limit (~4.5 MB).** PDF uploads pass *through* the
   function, so a PDF larger than Vercel's body limit will fail with 413 even
   though the app's own limit is 32 MB. Most IA PDFs are under this, but the
   robust fix (later) is to upload directly from the browser to Supabase Storage
   via a signed URL, bypassing the function.
2. **Function duration (`maxDuration`).** A scoring call to Claude (high effort +
   thinking) can take tens of seconds. `vercel.json` sets `maxDuration: 60`.
   That works on Hobby (Fluid Compute) and Pro; if scoring ever times out, raise
   it (Pro allows up to 300s) or lower the model effort.
