// Applies schema.pg.sql to the configured Postgres database. Idempotent.
// Run with: npm run migrate

import 'dotenv/config';
import { db } from './connection.js';
import { ensureSchema } from './ensureSchema.js';

try {
  await ensureSchema();
  console.log('✓ Schema applied to Postgres (DATABASE_URL).');
} catch (err) {
  console.error('✗ Migration failed:', err.message);
  process.exitCode = 1;
} finally {
  await db.close();
}
