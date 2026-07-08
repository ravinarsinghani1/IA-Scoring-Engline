// Idempotent schema setup. Runs schema.sql (creates tables IF NOT EXISTS), then
// adds any columns that were introduced after a database was first created —
// SQLite's `CREATE TABLE IF NOT EXISTS` won't alter an existing table, so new
// columns need an explicit ALTER guarded by a column-existence check.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { db } from './connection.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Columns added after the initial schema, per table. Extend this as the model
// evolves; each entry is applied only if the column is missing.
const ADDED_COLUMNS = {
  draft: [
    { name: 'source_kind', ddl: "source_kind TEXT NOT NULL DEFAULT 'text'" },
    { name: 'source_file_name', ddl: 'source_file_name TEXT' },
    { name: 'source_file_path', ddl: 'source_file_path TEXT' },
  ],
  criterion_score: [
    { name: 'review_recommended', ddl: 'review_recommended INTEGER NOT NULL DEFAULT 0' },
    { name: 'boundary_note', ddl: 'boundary_note TEXT' },
    { name: 'range_low', ddl: 'range_low INTEGER' },
    { name: 'range_high', ddl: 'range_high INTEGER' },
  ],
  validation_record: [
    { name: 'draft_id', ddl: 'draft_id INTEGER' },
    { name: 'engine_range_low', ddl: 'engine_range_low INTEGER' },
    { name: 'engine_range_high', ddl: 'engine_range_high INTEGER' },
  ],
};

export function ensureSchema() {
  const schema = fs.readFileSync(path.join(__dirname, 'schema.sql'), 'utf8');
  db.raw.exec(schema);

  for (const [table, columns] of Object.entries(ADDED_COLUMNS)) {
    const existing = new Set(
      db.raw.prepare(`PRAGMA table_info(${table})`).all().map((c) => c.name)
    );
    for (const col of columns) {
      if (!existing.has(col.name)) {
        db.raw.exec(`ALTER TABLE ${table} ADD COLUMN ${col.ddl}`);
      }
    }
  }
}
