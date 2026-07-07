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

Backend:
```bash
cd server
npm install
npm run dev        # starts Express on http://localhost:4000
```

Frontend (separate terminal):
```bash
cd client
npm install
npm run dev        # starts Vite on http://localhost:5173
```

The frontend proxies `/api/*` to the backend during development.

## Status

Built incrementally per the build order. See the in-app steps and git history
for what's implemented.
