-- IB Math IA Scoring Engine — schema (PostgreSQL / Supabase).
--
-- This is the full current shape, including columns that were added over time
-- to the original SQLite schema. Because Supabase starts as a fresh database,
-- there is no incremental-ALTER migration to run — this file (idempotent via
-- IF NOT EXISTS) is the single source of truth.
--
-- Design choices kept deliberately close to the old SQLite schema so the app
-- layer is unchanged:
--   * boolean flags remain 0/1 INTEGER columns (serializers convert to JSON
--     booleans), rather than switching to BOOLEAN.
--   * created_at / submitted_at remain TEXT in 'YYYY-MM-DD HH:MM:SS' UTC form,
--     matching SQLite's datetime('now'), so API output shape does not change.

-- Folders group explorations by batch/year (e.g. "Math IA 2024-26").
CREATE TABLE IF NOT EXISTS folder (
  id          INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  name        TEXT NOT NULL,
  created_at  TEXT NOT NULL DEFAULT to_char((now() AT TIME ZONE 'utc'), 'YYYY-MM-DD HH24:MI:SS')
);

CREATE TABLE IF NOT EXISTS exploration (
  id                    INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  folder_id             INTEGER REFERENCES folder(id) ON DELETE SET NULL,  -- NULL = ungrouped
  student_id            TEXT,
  student_name          TEXT NOT NULL,
  subject               TEXT NOT NULL DEFAULT 'AI',   -- 'AI' | 'AA'
  level                 TEXT NOT NULL DEFAULT 'SL',   -- 'SL' | 'HL'
  current_draft_number  INTEGER NOT NULL DEFAULT 0,
  created_at            TEXT NOT NULL DEFAULT to_char((now() AT TIME ZONE 'utc'), 'YYYY-MM-DD HH24:MI:SS'),
  CHECK (subject IN ('AI', 'AA')),
  CHECK (level IN ('SL', 'HL'))
);

CREATE TABLE IF NOT EXISTS draft (
  id                            INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  exploration_id                INTEGER NOT NULL REFERENCES exploration(id) ON DELETE CASCADE,
  draft_number                  INTEGER NOT NULL,
  raw_text                      TEXT NOT NULL,
  extracted_math_content        TEXT,
  word_count                    INTEGER NOT NULL DEFAULT 0,
  page_count                    INTEGER NOT NULL DEFAULT 0,
  submitted_at                  TEXT NOT NULL DEFAULT to_char((now() AT TIME ZONE 'utc'), 'YYYY-MM-DD HH24:MI:SS'),

  -- Original uploaded source (PDF). When present, the actual file is sent to
  -- the model so figures, graphs and equations are seen. NULL for paste-text.
  source_kind                   TEXT NOT NULL DEFAULT 'text',  -- 'text' | 'pdf'
  source_file_name              TEXT,
  source_file_path              TEXT,

  -- Authenticity gate. NULL until checked. Gate must pass before scoring.
  authenticity_similarity_score REAL,
  authenticity_ai_label_score   REAL,
  authenticity_gate_passed      INTEGER NOT NULL DEFAULT 0,  -- boolean 0/1

  UNIQUE (exploration_id, draft_number)
);

CREATE INDEX IF NOT EXISTS idx_draft_exploration ON draft(exploration_id);

CREATE TABLE IF NOT EXISTS criterion_score (
  id                       INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  draft_id                 INTEGER NOT NULL REFERENCES draft(id) ON DELETE CASCADE,
  criterion                TEXT NOT NULL,               -- 'A'|'B'|'C'|'D'|'E'
  engine_mark              INTEGER,
  max_mark                 INTEGER NOT NULL,
  confidence_tier          TEXT NOT NULL,               -- 'high'|'medium'|'low'
  reasoning_summary        TEXT,
  improvement_suggestion   TEXT,
  teacher_override_mark    INTEGER,
  changed_since_last_draft INTEGER NOT NULL DEFAULT 0,  -- boolean 0/1

  -- Medium-confidence criteria (D, E): boundary flag + note.
  review_recommended       INTEGER NOT NULL DEFAULT 0,  -- boolean 0/1
  boundary_note            TEXT,

  -- Low-confidence criterion (C): suggested range instead of a definitive mark.
  range_low                INTEGER,
  range_high               INTEGER,

  UNIQUE (draft_id, criterion),
  CHECK (criterion IN ('A', 'B', 'C', 'D', 'E')),
  CHECK (confidence_tier IN ('high', 'medium', 'low'))
);

CREATE INDEX IF NOT EXISTS idx_criterion_score_draft ON criterion_score(draft_id);

CREATE TABLE IF NOT EXISTS validation_record (
  id                  INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  exploration_id      INTEGER NOT NULL REFERENCES exploration(id) ON DELETE CASCADE,
  draft_id            INTEGER,
  criterion           TEXT NOT NULL,
  engine_mark         INTEGER,
  engine_range_low    INTEGER,
  engine_range_high   INTEGER,
  teacher_mark        INTEGER,
  ib_moderated_mark   INTEGER,
  agreement_delta     INTEGER,

  UNIQUE (exploration_id, criterion),
  CHECK (criterion IN ('A', 'B', 'C', 'D', 'E'))
);

CREATE INDEX IF NOT EXISTS idx_validation_exploration ON validation_record(exploration_id);
