// Idempotent schema setup. Runs schema.pg.sql, which creates every table and
// index IF NOT EXISTS. Because Postgres is a fresh database (no legacy SQLite
// rows to migrate in place), the full current schema is applied directly — no
// incremental ALTER steps are needed.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { db } from './connection.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export async function ensureSchema() {
  const schema = fs.readFileSync(path.join(__dirname, 'schema.pg.sql'), 'utf8');
  await db.exec(schema);
}
