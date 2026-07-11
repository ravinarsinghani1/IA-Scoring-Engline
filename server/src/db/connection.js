// Database connection + thin adapter (PostgreSQL / Supabase).
//
// We expose a tiny, driver-agnostic interface (`get`, `all`, `run`,
// `transaction`) rather than leaking the driver everywhere. Repositories are
// written as async functions against this interface and use `?` positional
// placeholders (SQLite style); this adapter rewrites them to Postgres `$n`
// placeholders, so the repositories did not have to change when we moved from
// SQLite to Postgres.

import pg from 'pg';

const { Pool, types } = pg;

// COUNT(*) and other bigint (int8, OID 20) values come back as strings by
// default to avoid precision loss. Our counts are always small, and callers/
// serializers expect JS numbers (as SQLite returned), so parse them to Number.
types.setTypeParser(20, (v) => (v === null ? null : parseInt(v, 10)));

const connectionString = process.env.DATABASE_URL;

let pool = null;

function getPool() {
  if (!connectionString) {
    const err = new Error(
      'Database is not configured: add DATABASE_URL to server/.env (see server/.env.example), then restart the server.'
    );
    err.status = 503;
    err.expose = true;
    throw err;
  }
  if (!pool) {
    pool = new Pool({
      connectionString,
      // Supabase requires TLS. The pooler presents a certificate that Node
      // won't verify against the system CA store, so disable strict verify.
      ssl: { rejectUnauthorized: false },
      max: 5, // small pool — serverless/pooled Postgres does the heavy lifting
    });
  }
  return pool;
}

// Rewrite SQLite-style `?` placeholders to Postgres `$1, $2, ...`. Our SQL never
// contains a literal `?` inside a string, so a positional pass is safe.
function toPgPlaceholders(sql) {
  let i = 0;
  return sql.replace(/\?/g, () => `$${++i}`);
}

function normalize(params) {
  if (params === undefined || params === null) return [];
  return Array.isArray(params) ? params : [params];
}

export const db = {
  /**
   * Run a statement (INSERT/UPDATE/DELETE/DDL). Returns
   * { changes, lastInsertRowid }. For INSERTs that need the new id, append
   * `RETURNING id` to the SQL and read `result.lastInsertRowid`.
   */
  async run(sql, params = []) {
    const res = await getPool().query(toPgPlaceholders(sql), normalize(params));
    return {
      changes: res.rowCount,
      lastInsertRowid: res.rows && res.rows[0] ? res.rows[0].id : undefined,
    };
  },

  /** Fetch a single row (or undefined). */
  async get(sql, params = []) {
    const res = await getPool().query(toPgPlaceholders(sql), normalize(params));
    return res.rows[0];
  },

  /** Fetch all matching rows. */
  async all(sql, params = []) {
    const res = await getPool().query(toPgPlaceholders(sql), normalize(params));
    return res.rows;
  },

  /**
   * Run `fn` and await it. NOTE: queries issued inside `fn` via `db` use pooled
   * connections, so this does not currently provide cross-statement atomicity.
   * There are no transaction callers today; if one is added and needs true
   * atomicity, acquire a dedicated client (getPool().connect()) and BEGIN/COMMIT
   * on it. Kept for interface parity with the previous adapter.
   */
  async transaction(fn) {
    return fn();
  },

  /** Run raw SQL (may contain multiple statements). Used by schema setup. */
  async exec(sql) {
    await getPool().query(sql);
  },

  /** Close the pool (scripts/tests). */
  async close() {
    if (pool) {
      await pool.end();
      pool = null;
    }
  },
};
