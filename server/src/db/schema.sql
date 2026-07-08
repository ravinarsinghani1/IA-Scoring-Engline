-- IB Math IA Scoring Engine — schema
-- SQLite dialect. Kept intentionally close to standard SQL so a later
-- migration to Postgres is mostly a matter of type tweaks (INTEGER PK ->
-- serial/identity, INTEGER 0/1 booleans -> BOOLEAN, TEXT timestamps -> timestamptz).

PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS exploration (
  id                    INTEGER PRIMARY KEY AUTOINCREMENT,
  student_id            TEXT,
  student_name          TEXT NOT NULL,
  subject               TEXT NOT NULL DEFAULT 'AI',   -- 'AI' (only supported subject in MVP)
  level                 TEXT NOT NULL DEFAULT 'SL',   -- 'SL' | 'HL'
  current_draft_number  INTEGER NOT NULL DEFAULT 0,
  created_at            TEXT NOT NULL DEFAULT (datetime('now')),
  CHECK (subject IN ('AI', 'AA')),
  CHECK (level IN ('SL', 'HL'))
);

CREATE TABLE IF NOT EXISTS draft (
  id                            INTEGER PRIMARY KEY AUTOINCREMENT,
  exploration_id                INTEGER NOT NULL,
  draft_number                  INTEGER NOT NULL,
  raw_text                      TEXT NOT NULL,
  extracted_math_content        TEXT,                 -- populated by later extraction step; nullable for now
  word_count                    INTEGER NOT NULL DEFAULT 0,
  page_count                    INTEGER NOT NULL DEFAULT 0,
  submitted_at                  TEXT NOT NULL DEFAULT (datetime('now')),

  -- Original uploaded source (PDF). When present, the actual file is sent to
  -- the model so figures, graphs and equations are seen. NULL for paste-text.
  source_kind                   TEXT NOT NULL DEFAULT 'text',  -- 'text' | 'pdf'
  source_file_name              TEXT,
  source_file_path              TEXT,

  -- Authenticity gate. NULL until checked. Gate must pass before scoring.
  authenticity_similarity_score REAL,                 -- nullable until checked
  authenticity_ai_label_score   REAL,                 -- nullable until checked
  authenticity_gate_passed      INTEGER NOT NULL DEFAULT 0,  -- boolean 0/1

  FOREIGN KEY (exploration_id) REFERENCES exploration(id) ON DELETE CASCADE,
  UNIQUE (exploration_id, draft_number)
);

CREATE INDEX IF NOT EXISTS idx_draft_exploration ON draft(exploration_id);

CREATE TABLE IF NOT EXISTS criterion_score (
  id                     INTEGER PRIMARY KEY AUTOINCREMENT,
  draft_id               INTEGER NOT NULL,
  criterion              TEXT NOT NULL,               -- 'A'|'B'|'C'|'D'|'E'
  engine_mark            INTEGER,                     -- whole numbers only
  max_mark               INTEGER NOT NULL,
  confidence_tier        TEXT NOT NULL,               -- 'high'|'medium'|'low'
  reasoning_summary      TEXT,                        -- short, specific, references student's actual content
  improvement_suggestion TEXT,                        -- concrete, actionable, tied to next-level gap
  teacher_override_mark  INTEGER,                     -- nullable
  changed_since_last_draft INTEGER NOT NULL DEFAULT 0, -- boolean 0/1

  -- Medium-confidence criteria (D, E): flag + note when the mark sits on a
  -- markband boundary and the teacher should take a closer look.
  review_recommended     INTEGER NOT NULL DEFAULT 0,  -- boolean 0/1
  boundary_note          TEXT,

  -- Low-confidence criterion (C, Personal engagement): a suggested range instead
  -- of a definitive mark. engine_mark is NULL for these; range_low/high are set.
  range_low              INTEGER,
  range_high             INTEGER,

  FOREIGN KEY (draft_id) REFERENCES draft(id) ON DELETE CASCADE,
  UNIQUE (draft_id, criterion),
  CHECK (criterion IN ('A', 'B', 'C', 'D', 'E')),
  CHECK (confidence_tier IN ('high', 'medium', 'low'))
);

CREATE INDEX IF NOT EXISTS idx_criterion_score_draft ON criterion_score(draft_id);

CREATE TABLE IF NOT EXISTS validation_record (
  id                  INTEGER PRIMARY KEY AUTOINCREMENT,
  exploration_id      INTEGER NOT NULL,
  criterion           TEXT NOT NULL,
  engine_mark         INTEGER,
  teacher_mark        INTEGER,
  ib_moderated_mark   INTEGER,                        -- nullable; released months later
  agreement_delta     INTEGER,                        -- teacher_mark - engine_mark (or as computed)

  FOREIGN KEY (exploration_id) REFERENCES exploration(id) ON DELETE CASCADE,
  CHECK (criterion IN ('A', 'B', 'C', 'D', 'E'))
);

CREATE INDEX IF NOT EXISTS idx_validation_exploration ON validation_record(exploration_id);
