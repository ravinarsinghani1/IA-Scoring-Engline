// Idempotent schema setup with an ordered, additive migration runner.
//
// Two layers:
//   1. schema.pg.sql — the baseline. Creates the original tables/indexes
//      IF NOT EXISTS. Stays the single source of truth for the pre-auth shape.
//   2. migrations/*.sql — ordered, additive changes applied AFTER the baseline,
//      each recorded once in schema_migrations so it runs a single time. Files
//      are also individually idempotent (IF NOT EXISTS / ADD COLUMN IF NOT
//      EXISTS) as a belt-and-braces measure.
//
// Because Postgres starts fresh (no legacy SQLite rows to migrate in place),
// this is safe to run repeatedly.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { db } from './connection.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export async function ensureSchema() {
  // 1. Baseline.
  const baseline = fs.readFileSync(path.join(__dirname, 'schema.pg.sql'), 'utf8');
  await db.exec(baseline);

  // Ledger of applied migration files.
  await db.exec(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      filename    TEXT PRIMARY KEY,
      applied_at  TEXT NOT NULL DEFAULT to_char((now() AT TIME ZONE 'utc'), 'YYYY-MM-DD HH24:MI:SS')
    );
  `);

  // 2. Ordered migrations.
  const migrationsDir = path.join(__dirname, 'migrations');
  if (!fs.existsSync(migrationsDir)) return;

  const files = fs
    .readdirSync(migrationsDir)
    .filter((f) => f.endsWith('.sql'))
    .sort(); // filename order: 001_, 002_, ...

  for (const filename of files) {
    const already = await db.get(
      'SELECT 1 AS ok FROM schema_migrations WHERE filename = ?',
      [filename]
    );
    if (already) continue;

    const sql = fs.readFileSync(path.join(migrationsDir, filename), 'utf8');
    await db.exec(sql);
    await db.run('INSERT INTO schema_migrations (filename) VALUES (?)', [filename]);
    console.log(`  ↳ applied migration ${filename}`);
  }
}
