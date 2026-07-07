// Applies schema.sql to the database. Idempotent (uses IF NOT EXISTS).
// Run with: npm run migrate

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { db, DB_PATH } from './connection.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const schema = fs.readFileSync(path.join(__dirname, 'schema.sql'), 'utf8');
db.raw.exec(schema);

console.log(`✓ Schema applied to ${DB_PATH}`);
