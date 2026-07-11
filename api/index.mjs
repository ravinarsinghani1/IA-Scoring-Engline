// Vercel serverless entry point. An Express app is itself a (req, res) handler,
// so Vercel's Node runtime can invoke it directly. All /api/* requests are
// rewritten to this function by vercel.json; Express matches on the original
// path (routes are mounted under /api/...).
//
// .mjs so this file is ES modules even though the repo root package.json is not
// type:module. The server code it imports is type:module (server/package.json).
import app from '../server/src/app.js';

export default app;
