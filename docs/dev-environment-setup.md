# Dev environment setup — separate Supabase project + Google OAuth (Phase 0)

> Phase 0 work runs against a **separate Supabase dev project**, NOT the live/shared one,
> so schema changes can't affect production (see `gap-analysis.md` §5).
>
> The steps below are **yours to do in the dashboards** — they involve account access and
> secrets, which can't be automated from here. Everything on the code side is already
> wired to read the values you'll produce. **Put all secrets straight into gitignored env
> files — do not paste them into chat.**

---

## Part 1 — Create the Supabase dev project (you)

1. In the Supabase dashboard, create a **new project** (e.g. `saaryavi-dev`). Pick the
   **Sydney (syd)** region to match the existing prod setup / Vercel `syd1` pinning.
2. Save the database password it generates (into a password manager).
3. Collect these values (Dashboard → **Project Settings → API**, and **Connect**):

   | Value | Where in dashboard | Goes into | Secret? |
   |---|---|---|---|
   | Project URL `https://<ref>.supabase.co` | Settings → API | `SUPABASE_URL` (server) + `VITE_SUPABASE_URL` (client) | no |
   | `anon` public key | Settings → API | `SUPABASE_ANON_KEY` (server) + `VITE_SUPABASE_ANON_KEY` (client) | no (public) |
   | `service_role` key | Settings → API | `SUPABASE_SERVICE_ROLE_KEY` (server) | **yes** |
   | JWT secret | Settings → API → JWT Settings | `SUPABASE_JWT_SECRET` (server) | **yes** |
   | Transaction-pooler connection string (port 6543) | Connect → Transaction pooler | `DATABASE_URL` (server) | **yes** (has DB pw) |

4. Paste them into the gitignored env files:
   - `server/.env` — all of the above (this is the file the API reads).
   - `client/.env` — `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` only.
   - Templates: `server/.env.example` and `client/.env.example` both already exist in the
     repo — copy each to `.env` and fill in the values.

> On this branch, pointing `server/.env`'s `DATABASE_URL` at the **dev** project is what
> keeps prod safe. Double-check it's the dev pooler string before running any migration.

---

## Part 2 — Google Workspace OAuth (you) — exact fields

This is a two-place setup: **Google Cloud Console** issues the credentials, **Supabase**
consumes them. The one field you need *from the code side* is the redirect URL format,
which is below.

### 2a. In Google Cloud Console
1. APIs & Services → **Credentials** → **Create Credentials → OAuth client ID**.
2. Application type: **Web application**.
3. **Authorized JavaScript origins** — add:
   - `http://localhost:5173` (Vite dev)
   - your Vercel URL later, when you deploy the branch
4. **Authorized redirect URIs** — add exactly this (Supabase's callback):
   ```
   https://<your-dev-project-ref>.supabase.co/auth/v1/callback
   ```
   Replace `<your-dev-project-ref>` with the ref from your dev Project URL.
5. Click Create — Google gives you a **Client ID** and **Client Secret**. (For a Workspace-
   only app you may also want to set the OAuth consent screen to "Internal".)

### 2b. In the Supabase dashboard (dev project)
1. **Authentication → Providers → Google** → enable.
2. Paste the **Client ID** and **Client Secret** from step 2a. (These stay in Supabase —
   the app never sees them.)
3. **Authentication → URL Configuration**:
   - **Site URL:** `http://localhost:5173`
   - **Redirect URLs (allow-list):** add `http://localhost:5173/**` (and the Vercel URL
     later).

### What I need back from you (non-secret) to finish wiring the client
Just confirm these two, which are safe to share in chat:
- **Project ref / URL** (`https://<ref>.supabase.co`) — so I can hardcode nothing and
  reference the right redirect format in docs/tests.
- That Google provider shows **enabled** in Supabase.

Everything secret (`DATABASE_URL`, `SUPABASE_JWT_SECRET`, `service_role`, Google Client
Secret) should go **only** into `server/.env` / the Supabase dashboard — never into chat,
code, or a committed file.

---

## Part 3 — What happens on the code side (me, in Phase 0 build)

Once the dev project exists and `server/.env` is filled in:
- Run the new migration runner against the dev DB (`npm run migrate`) to create `school` /
  `app_user` and the nullable `exploration.teacher_id`/`school_id` — all on the dev
  project, prod untouched.
- Wire `client/src/lib/supabaseClient.js` to `VITE_SUPABASE_URL` / `VITE_SUPABASE_ANON_KEY`.
- Verify JWTs server-side with `SUPABASE_JWT_SECRET` via `jose`.

See `phase-0-foundations.md` for the full file-level task list.

---

## Quick checklist

- [ ] Dev Supabase project created (Sydney region)
- [ ] `server/.env` filled: `DATABASE_URL`, `SUPABASE_URL`, `SUPABASE_ANON_KEY`,
      `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_JWT_SECRET`
- [ ] `client/.env` filled: `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`
- [ ] Google OAuth client created; redirect URI = `https://<ref>.supabase.co/auth/v1/callback`
- [ ] Google provider enabled in Supabase with Client ID + Secret
- [ ] Supabase Site URL + redirect allow-list set for `localhost:5173`
- [ ] Confirmed project ref + provider-enabled back to me
