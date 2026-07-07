import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { db } from './db/connection.js';
import explorationsRouter from './routes/explorations.js';
import draftsRouter from './routes/drafts.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Ensure schema exists on startup (idempotent). Keeps local dev frictionless.
db.raw.exec(fs.readFileSync(path.join(__dirname, 'db', 'schema.sql'), 'utf8'));

const app = express();
app.use(cors());
app.use(express.json({ limit: '5mb' })); // explorations can be long

app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok', service: 'ia-scoring-server' });
});

app.use('/api/explorations', explorationsRouter);
app.use('/api/drafts', draftsRouter);

// 404 for unknown API routes
app.use('/api', (_req, res) => res.status(404).json({ error: 'not found' }));

// Central error handler. Routes/services may set `err.status` (e.g. 400 for
// validation) and it will be surfaced with the error message; anything else is
// treated as an unexpected 500.
app.use((err, _req, res, _next) => {
  const status = err.status && err.status >= 400 && err.status < 600 ? err.status : 500;
  if (status >= 500) console.error('[error]', err);
  res.status(status).json({ error: status >= 500 ? 'internal server error' : err.message });
});

const PORT = process.env.PORT || 4000;
app.listen(PORT, () => {
  console.log(`✓ IA scoring server listening on http://localhost:${PORT}`);
});
