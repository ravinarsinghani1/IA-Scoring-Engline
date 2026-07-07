// Applies schema.sql and any later-added columns. Idempotent.
// Run with: npm run migrate

import { DB_PATH } from './connection.js';
import { ensureSchema } from './ensureSchema.js';

ensureSchema();

console.log(`✓ Schema applied to ${DB_PATH}`);
