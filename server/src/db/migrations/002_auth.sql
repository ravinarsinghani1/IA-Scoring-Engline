-- 002_auth.sql — Phase 0 (Saaryavi Foundations): user / role / school / ownership.
--
-- SAFETY: every statement here is ADDITIVE and IDEMPOTENT. New tables and
-- NULLABLE new columns only. It does NOT alter or constrain any existing
-- exploration / draft / criterion_score column, so the current Scoring Engine
-- keeps working unchanged. Rolling back = dropping the objects created here.
--
-- Applied by the ordered migration runner (see ensureSchema.js) AFTER the
-- baseline schema.pg.sql, and recorded once in schema_migrations.

-- A school is the tenant boundary. Registration is locked to its email domain.
CREATE TABLE IF NOT EXISTS school (
  id                       INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  name                     TEXT NOT NULL,
  domain                   TEXT NOT NULL UNIQUE,          -- e.g. 'saaryavi.edu'
  student_access_enabled   INTEGER NOT NULL DEFAULT 0,    -- boolean 0/1; Student role opt-in, OFF by default
  created_at               TEXT NOT NULL DEFAULT to_char((now() AT TIME ZONE 'utc'), 'YYYY-MM-DD HH24:MI:SS')
);

-- App-level profile, 1:1 with a Supabase auth.users row (id = that UUID).
-- We deliberately do NOT add a cross-schema FK to auth.users; the link is
-- enforced in the app (bootstrap upsert) so the migration stays self-contained.
CREATE TABLE IF NOT EXISTS app_user (
  id               UUID PRIMARY KEY,                       -- equals auth.users.id
  school_id        INTEGER REFERENCES school(id) ON DELETE SET NULL,  -- NULL until profile completed
  email            TEXT NOT NULL UNIQUE,
  full_name        TEXT,
  role             TEXT NOT NULL DEFAULT 'teacher',
  role_confirmed   INTEGER NOT NULL DEFAULT 0,             -- boolean 0/1; true after Role Picker
  subjects         TEXT,                                   -- JSON array, e.g. '["math_aa","math_ai"]'
  created_at       TEXT NOT NULL DEFAULT to_char((now() AT TIME ZONE 'utc'), 'YYYY-MM-DD HH24:MI:SS'),
  CHECK (role IN ('teacher', 'coordinator', 'student'))
);

CREATE INDEX IF NOT EXISTS idx_app_user_school ON app_user(school_id);

-- Ownership on the existing exploration table. BOTH NULLABLE: existing rows have
-- no owner, and a NOT NULL here would break the live app immediately.
ALTER TABLE exploration ADD COLUMN IF NOT EXISTS teacher_id UUID;     -- -> app_user.id
ALTER TABLE exploration ADD COLUMN IF NOT EXISTS school_id  INTEGER;  -- -> school.id

CREATE INDEX IF NOT EXISTS idx_exploration_teacher ON exploration(teacher_id);
CREATE INDEX IF NOT EXISTS idx_exploration_school  ON exploration(school_id);
