// Builds and exports the Express app WITHOUT starting a listener. This lets the
// same app run two ways:
//   * locally as a long-running server (src/index.js calls app.listen)
//   * on Vercel as a serverless function (api/index.mjs default-exports this app)
// Schema setup is NOT run here — run it once via `npm run migrate` (locally or
// as a deploy step), not on every serverless cold start.

import 'dotenv/config';
import express from 'express';
import cors from 'cors';

import authRouter from './routes/auth.js';
import explorationsRouter from './routes/explorations.js';
import draftsRouter from './routes/drafts.js';
import validationRouter from './routes/validation.js';
import foldersRouter from './routes/folders.js';
import questionBankRouter from './routes/questionBank.js';
import { requireAuth, requireProfile } from './middleware/requireAuth.js';

const app = express();
app.use(cors());
app.use(express.json({ limit: '5mb' })); // explorations can be long

app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok', service: 'ia-scoring-server' });
});

app.use('/api/auth', authRouter);

// Data routes require a valid Supabase JWT AND a completed app_user profile.
// (requireProfile 403s an authenticated-but-profileless caller — e.g. one whose
// email domain failed the bootstrap domain-lock.) This is the §5 step-6 cutover:
// it closes the previously-open data routes. NOTE: per-teacher ownership SCOPING
// (only seeing your own explorations) is a separate, still-pending change — this
// step gates access to provisioned users, it does not yet filter by owner.
app.use('/api/folders', requireAuth, requireProfile, foldersRouter);
app.use('/api/explorations', requireAuth, requireProfile, explorationsRouter);
app.use('/api/drafts', requireAuth, requireProfile, draftsRouter);
app.use('/api/validation', requireAuth, requireProfile, validationRouter);
app.use('/api/question-bank', requireAuth, requireProfile, questionBankRouter);

// 404 for unknown API routes
app.use('/api', (_req, res) => res.status(404).json({ error: 'not found' }));

// Central error handler. Routes/services may set `err.status` (e.g. 400 for
// validation). Client errors (4xx) always surface their message; 5xx are masked
// as a generic message UNLESS `err.expose` is set (used for intentional,
// safe-to-show conditions like "no API key configured").
app.use((err, _req, res, _next) => {
  // Multer upload errors (e.g. file too large) are client errors.
  if (err && err.name === 'MulterError') {
    const msg =
      err.code === 'LIMIT_FILE_SIZE'
        ? 'PDF is too large (max 32 MB).'
        : `Upload error: ${err.message}`;
    return res.status(400).json({ error: msg });
  }
  const status = err.status && err.status >= 400 && err.status < 600 ? err.status : 500;
  if (status >= 500) console.error('[error]', err);
  const showMessage = status < 500 || err.expose === true;
  res.status(status).json({ error: showMessage ? err.message : 'internal server error' });
});

export default app;
