// Database connection + thin adapter.
//
// We deliberately expose a tiny, driver-agnostic interface (`get`, `all`, `run`,
// `transaction`) rather than leaking better-sqlite3 everywhere. Repositories are
// written as async functions against this interface. SQLite is synchronous, so
// these resolve immediately — but because callers already `await` them, swapping
// in an async Postgres adapter later requires changing only THIS file.

import Database from 'better-sqlite3';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const DB_PATH =
  process.env.DATABASE_FILE || path.join(__dirname, '..', '..', 'data', 'ia.db');

// Ensure the data directory exists.
fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });

const sqlite = new Database(DB_PATH);
sqlite.pragma('journal_mode = WAL');
sqlite.pragma('foreign_keys = ON');

export const db = {
  /** Run a statement (INSERT/UPDATE/DELETE/DDL). Returns { changes, lastInsertRowid }. */
  async run(sql, params = []) {
    return sqlite.prepare(sql).run(...normalize(params));
  },

  /** Fetch a single row (or undefined). */
  async get(sql, params = []) {
    return sqlite.prepare(sql).get(...normalize(params));
  },

  /** Fetch all matching rows. */
  async all(sql, params = []) {
    return sqlite.prepare(sql).all(...normalize(params));
  },

  /** Run `fn` inside a transaction. `fn` receives no args and may be async-free. */
  async transaction(fn) {
    const txn = sqlite.transaction(fn);
    return txn();
  },

  /** Escape hatch for scripts (migrations). Avoid in app code. */
  raw: sqlite,
};

// better-sqlite3 wants positional params spread; accept either an array or a
// single value for ergonomics.
function normalize(params) {
  if (params === undefined || params === null) return [];
  return Array.isArray(params) ? params : [params];
}

export { DB_PATH };
