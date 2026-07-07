# IB Math IA Scoring Engine (MVP)

An AI-assisted feedback and scoring engine for IB Mathematics Internal Assessments
(the "exploration"). Starting scope: **Mathematics AI SL**.

This tool sits at steps 2–3 of the real IA workflow: it gives students detailed,
actionable feedback so they can improve their own draft, then gives teachers a fast,
low-effort way to confirm or correct the assessment. **Every score is advisory,
pending the teacher's final judgment — the engine never issues an authoritative grade.**

## Architecture

```
IA System/
├── server/          Node.js + Express API (all Claude API calls live here)
│   ├── src/
│   │   ├── db/            SQLite connection + schema + migrations
│   │   ├── repositories/  Data-access layer (swappable: SQLite now, Postgres later)
│   │   ├── routes/        Express route handlers
│   │   ├── services/      Business logic (scoring, authenticity, etc.)
│   │   └── index.js       App entry point
│   └── data/        SQLite database file (gitignored)
└── client/          React (Vite) + Tailwind frontend
```

**Data layer is deliberately abstracted behind repositories** so migrating from
SQLite to Postgres later touches only the DB adapter and SQL dialect, not app logic.

## Prerequisites

- Node.js (installed via nvm; this repo was built on Node v24 LTS)

## Running locally

### One command (recommended)

From the project root:

```bash
npm run setup      # first time only — installs client + server dependencies
npm run dev        # starts BOTH the backend and frontend together
```

Then open **http://localhost:5173**.

- `npm run dev` starts the Express API (port 4000) and the Vite frontend (port
  5173) in a single terminal, with output prefixed `[server]` / `[client]`.
- It automatically frees ports 4000/5173 first (via the `predev` step), so a
  leftover copy from a previous run won't cause an `EADDRINUSE` error.
- **To stop:** press `Ctrl+C` once in that terminal — it shuts both down.
  (Don't use `npm run free-ports` to stop it; the server runs under `node
  --watch`, which will just respawn. `free-ports` is only a pre-start cleanup.)

### Running the two halves separately (optional)

Useful when debugging one side. Use two terminals:

```bash
cd server && npm run dev        # Express on http://localhost:4000
cd client && npm run dev        # Vite on http://localhost:5173
```

The frontend proxies `/api/*` to the backend during development.

## Status

Built incrementally per the build order. See the in-app steps and git history
for what's implemented.
