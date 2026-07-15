# START HERE — IB Math IA project bundle (for a UI/UX design pass)

This ZIP contains the real content of two related projects, exported as files so
any Claude can read them directly (no links, no login, no private-repo access).
**Nothing sensitive is included** — no API keys, no database credentials, and no
student names or student data.

## What's in this bundle

### 1. `scoring-engine/` — the app to redesign
An advisory tool that scores IB Mathematics Internal Assessment ("exploration")
draft PDFs against the five IB criteria, for teachers.
- `design-brief.md` — the full UI/UX brief: product, screens, priorities, constraints.
- `frontend/` — the REAL React + Tailwind source (App.jsx, api.js, index.css, and all
  12 components incl. `ScoreFeedback.jsx`, `AuthenticityPanel.jsx`, `ValidationView.jsx`).
- `domain/criteria.js` — criteria A–E, confidence tiers, and full IB markbands.

### 2. `topic-guidance/` — the topic-feedback workflow
A separate, upstream workflow: it takes a student's "Form A" topic proposal and
produces a standardized one-page feedback sheet steering the topic toward a top-band
(7/7) exploration — BEFORE the student writes the draft.
- `README.md` — how the workflow runs end to end.
- `reviewer-rubric.md` — the internal review logic (the "topic-guidance flow logic"):
  criteria mapping, the 7 standard checks, verdict rules, AA/AI + SL/HL nuances.
- `one-page-feedback-template.md` — the fixed output structure.
- `generate-feedback.js` — turns a per-candidate JSON into a one-page DOCX.
  (The per-student candidate files are intentionally omitted — they contain real
  student names. This folder is the reusable logic only.)

## The ask
Redesign the **scoring-engine** interface (React + Tailwind), keeping all behaviour.
The `topic-guidance` folder is included for context on the wider product. See
`scoring-engine/design-brief.md` for the prioritised UI/UX opportunities.
