# Phase 0 — Foundations (concrete, file-level task list)

> Goal of Phase 0: a real **user / role / school / ownership** model + working
> **Sign In / Sign Up / Role Picker**, with the design-token layer in place — built so the
> current Scoring Engine keeps working unchanged and everything is additive/nullable.
>
> **Explicitly OUT of Phase 0** (moved to Phase 5): Coordinator 2FA. Phase 0 builds the
> role model and basic auth only.
>
> **Status (2026-07-19):** this began as a pre-implementation task list. Most of it has
> since been **drafted in the working tree but is not yet committed.** The major new pieces
> — the migration runner, `002_auth.sql`, the `jose`/`supabase-js`/`react-router-dom`
> dependencies, and the "New" server + client auth files in §3–§4 — exist untracked on this
> branch and are marked **✅ (done, uncommitted)** inline. Separately, the **"Edited"
> existing files** (`server/src/app.js`, `client/src/App.jsx`, `client/src/api.js`,
> `client/src/index.css`, and both `package.json`s) already show local modifications, so
> those edits are **underway** too. What remains genuinely untouched is chiefly the
> out-of-band Supabase/OAuth dashboard setup in `dev-environment-setup.md` and the staged
> data-router cutover (§5 step 6). Treat this doc as the plan-of-record, not a claim that
> nothing is built.

---

## 1. Auth approach & library

**Recommendation: use Supabase Auth.** Rationale:
- `@supabase/supabase-js` is **already a server dependency**, and `DATABASE_URL` already
  points at Supabase — auth lives next to the data with no new vendor.
- It provides **Google Workspace OAuth** (the spec's prioritized SSO) *and*
  **email/password** out of the box — both required by the spec — without hand-rolling
  password hashing, reset emails, or session management (all of which are easy to get
  wrong and are on the "prohibited to build casually" list for good reason).
- **School-domain locking** (spec: "verify against your school's registered domain") is
  enforced in our own callback/profile-creation step, not by Supabase, so we keep control
  of it.

**How the pieces fit:**
- Identity lives in Supabase `auth.users` (managed by Supabase; we don't create this table).
- App-specific profile data (role, school, name) lives in our **new `app_user` table**,
  keyed 1:1 by the Supabase user UUID.
- Frontend uses `@supabase/supabase-js` to sign in and obtains a **JWT**.
- The Express API gains **JWT-verification middleware** that validates the token and loads
  the `app_user` row, attaching `req.user = { id, role, school_id, ... }` to each request.

**New libraries** — **✅ (done, uncommitted)** all added:
- Client: `@supabase/supabase-js` + `react-router-dom` are in `client/package.json`.
- Server: **`jose`** (`^6.2.3`) is in `server/package.json`, chosen over `jsonwebtoken` to
  verify the Supabase JWT locally using the project's JWT secret — avoids a network
  round-trip per request. (Alternative considered: `supabase.auth.getUser(token)`, simpler
  but slower.)

**Decisions to confirm before coding** (flagged, not assumed):
- Whether to stand up a **separate Supabase project for dev** (strongly recommended — see
  `gap-analysis.md` §5) vs. sharing the live one with additive-only migrations.
- Google Workspace OAuth requires configuring the provider + redirect URLs in the Supabase
  dashboard — an out-of-band setup step, not a code change.

---

## 2. Database migrations

### Migration mechanics (ordered, additive migration files)
Previously `schema.pg.sql` was a single idempotent baseline applied by `npm run migrate`.
Phase 0 introduces **ordered, additive migration files** so we never edit the baseline in
place (preserving rollback safety per `gap-analysis.md` §5).

- **✅ (done, uncommitted)** `ensureSchema.js` now applies the baseline first, then runs
  every `server/src/db/migrations/*.sql` in filename order, recording each in a
  `schema_migrations` ledger so it runs once (files stay individually idempotent as a
  belt-and-braces measure). `schema.pg.sql` remains the canonical baseline; a separate
  `001_baseline.sql` copy was **not** needed — the runner reads `schema.pg.sql` directly
  then layers migrations on top.
- **✅ (done, uncommitted)** `server/src/db/migrations/002_auth.sql` — all Phase 0 DDL
  (below), every statement `IF NOT EXISTS` / additive / nullable.

> Note: the runner reads `schema.pg.sql` + `migrations/*.sql` directly, so the `migrate.js`
> edit originally planned here was subsumed into `ensureSchema.js`. The DDL tables below
> document what `002_auth.sql` contains; cross-check the actual file before relying on
> exact column details.

### New tables (in `002_auth.sql`)

**`school`**
| column | type | notes |
|---|---|---|
| `id` | INTEGER GENERATED ALWAYS AS IDENTITY PK | |
| `name` | TEXT NOT NULL | e.g. "Saaryavi School" |
| `domain` | TEXT NOT NULL UNIQUE | registered email domain for domain-locked signup |
| `student_access_enabled` | INTEGER NOT NULL DEFAULT 0 | boolean 0/1 — Student role opt-in (off by default, per spec) |
| `created_at` | TEXT NOT NULL DEFAULT … | matches existing `to_char(now()…)` pattern |

**`app_user`** (profile keyed to Supabase `auth.users`)
| column | type | notes |
|---|---|---|
| `id` | UUID PRIMARY KEY | equals Supabase `auth.users.id` (no FK across schemas; enforced in app) |
| `school_id` | INTEGER REFERENCES school(id) | nullable until profile completed |
| `email` | TEXT NOT NULL UNIQUE | |
| `full_name` | TEXT | |
| `role` | TEXT NOT NULL DEFAULT 'teacher' | CHECK IN ('teacher','coordinator','student') |
| `role_confirmed` | INTEGER NOT NULL DEFAULT 0 | boolean — set true after Role Picker; drives first-login routing |
| `subjects` | TEXT | JSON array of subject assignments from Role Picker (e.g. `["math_aa","math_ai"]`) |
| `created_at` | TEXT NOT NULL DEFAULT … | |

### Additive columns on existing tables (nullable — must not break live app)

**`exploration`** — gains ownership (both **nullable**; existing rows have no owner):
```sql
ALTER TABLE exploration ADD COLUMN IF NOT EXISTS teacher_id UUID;      -- app_user.id
ALTER TABLE exploration ADD COLUMN IF NOT EXISTS school_id  INTEGER;   -- school.id
CREATE INDEX IF NOT EXISTS idx_exploration_teacher ON exploration(teacher_id);
CREATE INDEX IF NOT EXISTS idx_exploration_school  ON exploration(school_id);
```
> ⚠️ These are the only touches to existing tables in Phase 0, and both are `NULL`-able
> with no default constraint change — the current Scoring Engine's inserts/queries keep
> working untouched. **Do not** add `NOT NULL` here; existing rows would violate it and the
> live app would break.

*(Four-level folder hierarchy — `component`, `subject`, `cohort_year`, `draft_round` — is
Phase 2, not Phase 0.)*

---

## 3. Server files

### New — **✅ (done, uncommitted)** all files below exist untracked on this branch
- `server/src/services/auth/supabaseAuth.js` — verify Supabase JWT (via `jose` + project
  JWT secret), return the decoded claims.
- `server/src/middleware/requireAuth.js` — Express middleware: read `Authorization: Bearer`,
  verify via the above, load `app_user`, attach `req.user`; 401 on failure.
- `server/src/middleware/requireRole.js` — small guard factory
  (`requireRole('coordinator')`) for later phases; built now, used later.
- `server/src/repositories/userRepo.js` — `getById`, `getByEmail`, `upsertFromAuth`,
  `setRoleAndSubjects`, `markRoleConfirmed`.
- `server/src/repositories/schoolRepo.js` — `getByDomain`, `getById`.
- `server/src/routes/auth.js` — endpoints:
  - `GET  /api/auth/me` — current `app_user` (or 401).
  - `POST /api/auth/bootstrap` — called after first Supabase sign-in; creates/updates the
    `app_user` row, enforces **school-domain match** (email domain must equal a
    `school.domain`), returns profile + whether Role Picker is still needed.
  - `POST /api/auth/role` — Role Picker submit: sets `role`, `subjects`, `role_confirmed`.
- `server/src/db/migrations/002_auth.sql` — DDL from §2.
  *(A separate `001_baseline.sql` was **not** created — the runner reads `schema.pg.sql`
  directly as the baseline, so `migrations/` currently holds only `002_auth.sql`.)*

### Edited
- `server/src/app.js` — `app.use('/api/auth', authRouter)`; leave existing routers open for
  now, or wrap the data routers in `requireAuth` **only once the frontend sends tokens**
  (stage this so the current app keeps working mid-migration).
- `server/src/db/ensureSchema.js` — now hosts the ordered-migration runner (§2). *(The
  `migrate.js` change originally planned here proved unnecessary — it was subsumed into
  `ensureSchema.js`, and `migrate.js` is unmodified.)*
- `server/package.json` — add `jose` (or `jsonwebtoken`).
- `server/.env.example` — add `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_JWT_SECRET`
  (and note the separate-dev-project recommendation).
- *(Later in Phase 0, once auth is wired:)* `server/src/routes/explorations.js` +
  `draftRepo`/`explorationRepo` — stamp `teacher_id` / `school_id` from `req.user` on
  create, and scope list queries to the caller. Additive; guarded so unauthenticated dev
  still functions until cutover.

---

## 4. Client files

### New — **✅ (done, uncommitted)** the auth/routing files below exist untracked, with two deviations from this plan
> Two differences from the original list: (1) the tree adds
> `client/src/pages/AuthShell.jsx` (a shared layout wrapper for the auth screens) that this
> plan didn't list; (2) `client/src/theme/tokens.css` was **not** created as a separate
> file — the design tokens went into `client/src/index.css` instead (see "Edited" below).
- `client/src/lib/supabaseClient.js` — configured `@supabase/supabase-js` browser client.
- `client/src/auth/AuthContext.jsx` — React context: session, `app_user` profile, sign-in/
  out helpers, loading state; calls `/api/auth/me` + `bootstrap`.
- `client/src/auth/RequireAuth.jsx` — gate that redirects unauthenticated users to Sign In.
- `client/src/pages/SignIn.jsx` — Google SSO button (primary) + email/password + "Forgot
  password" link. *(The demo-only "Sign in as Teacher/Coordinator" segmented control from
  the prototype is a reviewer aid — omit from production per the spec.)*
- `client/src/pages/SignUp.jsx` — SSO + school-email registration with domain-verification
  messaging.
- `client/src/pages/RolePicker.jsx` — Teacher vs Coordinator cards + subject-assignment
  checkboxes (Math AA / Math AI enabled; others disabled/"coming soon"); posts to
  `/api/auth/role`. *(Choosing Coordinator shows an inline note that 2FA will be required —
  copy only; the 2FA screen itself is Phase 5.)*
- Design tokens — colors (`#12333A`, `#5C8F7E`, `#F7F5F1`, confidence + strength
  palettes…), fonts (Source Serif 4 / Libre Franklin), radii (6–8px); see handoff "Design
  Tokens". **In the tree these live in `client/src/index.css`**, not a separate
  `theme/tokens.css` as originally sketched.

### Edited
- `client/src/App.jsx` — introduce **routing** (add `react-router-dom`) and wrap the
  existing Scoring/Validation UI behind `RequireAuth`; unauthenticated → `SignIn`;
  authenticated-but-`role_confirmed=false` → `RolePicker`. The current single-screen tool
  becomes the authenticated Teacher landing for now (restyled properly in Phase 1).
- `client/src/api.js` — attach the Supabase JWT as `Authorization: Bearer` on every
  request; centralize 401 handling.
- `client/src/index.css` — pull in token layer + Google Fonts (Source Serif 4, Libre
  Franklin).
- `client/package.json` — add `@supabase/supabase-js`, `react-router-dom`.

---

## 5. Suggested build order within Phase 0

1. **DB**: migration runner + `002_auth.sql` (`school`, `app_user`, nullable
   `exploration.teacher_id`/`school_id`). Run against the **dev** Supabase project.
2. **Server auth**: `supabaseAuth.js` → `requireAuth` → `userRepo`/`schoolRepo` →
   `routes/auth.js`. Verify with a manually-minted token.
3. **Client auth plumbing**: `supabaseClient`, `AuthContext`, `api.js` bearer token.
4. **Screens**: `SignIn` → `SignUp` → `RolePicker`, gated by `RequireAuth`.
5. **Tokens**: apply the design-token layer (used lightly here; fully leveraged in Phase 1).
6. **Cutover (staged)**: stamp ownership on create + scope list queries + wrap data routers
   in `requireAuth`. Do this **last**, once sign-in reliably yields a token, so the live
   app isn't broken mid-phase.

## 6. Definition of done for Phase 0
- A new user can sign up (domain-checked), sign in (SSO + email/pw), and pick a role;
  `app_user` + `school` rows are created correctly.
- Every API request is authenticated; new explorations are stamped with `teacher_id` +
  `school_id`; a teacher's list is scoped to their own rows.
- The existing Scoring / Validation behavior still works for an authenticated teacher.
- All schema changes are additive + nullable; dropping the new objects fully restores the
  pre-Phase-0 database.
