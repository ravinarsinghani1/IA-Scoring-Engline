# IB Math IA Scoring Engine — UI/UX Design Handoff (self-contained)

> Paste this whole file, or upload it, into a Claude chat to brief a UI/UX redesign.
> It contains the real screen structure, components, domain model, and current
> design tokens — extracted directly from the codebase. **The ask: redesign the
> interface, keep the behaviour.** Nothing functional should change.

---

## 1. What the product is

A web tool that gives **IB Mathematics teachers** fast, *advisory* scoring and
feedback on students' Internal Assessment ("exploration") drafts, against the
five official IB criteria.

- **Primary user:** the IB Math teacher — scoring, moderating, validating. They
  scan and operate the UI; they don't read it top to bottom.
- **Unit of work:** a **draft PDF** of one student's exploration. The engine reads
  the actual PDF (figures, graphs, equations included) and returns a mark +
  feedback per criterion.
- **Non-negotiable framing:** every score is **advisory, provisional pending the
  teacher's final judgment**. The UI must never present a mark as authoritative.

Two top-level views (tabs): **Scoring** and **Validation harness**.

---

## 2. Stack & repo map (frontend only — design work never touches the backend)

- **Frontend:** React 18 + Vite + **Tailwind v4**. Client calls a same-origin `/api`.
- Backend (context only): Express + Supabase Postgres + Supabase Storage + Anthropic API, deployed on Vercel.

```
client/src/
  App.jsx                    # shell: header, tabs, two-column scoring layout
  api.js                     # thin fetch client → /api/*
  index.css                  # @import 'tailwindcss'; color-scheme: light (only)
  components/
    FolderBar.jsx            # folder (batch/year) picker + create
    NewExplorationForm.jsx   # student name, ID, course (AA/AI × SL/HL), create
    ExplorationList.jsx      # list of students + draft counts
    ExplorationDetail.jsx    # student header, PDF drop zone, drafts list, DraftCard
    AuthenticityPanel.jsx    # authenticity gate + "Score this draft" → ScoreFeedback
    ScoreFeedback.jsx        # THE A–E score display (highest-value surface)
    OriginalityCoach.jsx     # AI report panel
    SimilarityCheck.jsx      # AI report panel
    AiAuthorshipAdvisory.jsx # AI report panel
    ValidationView.jsx       # validation harness: enter known marks, see agreement
    BulkImport.jsx           # import past explorations
```

---

## 3. The two screens (real structure)

### Screen A — Scoring (two-column, `max-w-6xl`, collapses at `lg`)

**Header** (`App.jsx`): title "IB Math IA Scoring Engine" + a badge that currently
reads `Mathematics AI · MVP` (STALE — all four courses AA/AI × SL/HL are now
supported), subtitle "Advisory feedback only — every score is provisional pending
the teacher's judgment", and two nav tabs (Scoring / Validation harness).

**Left sidebar (340px):**
1. `FolderBar` — dropdown of folders ("All explorations" + each folder w/ count) + "+ New".
2. `NewExplorationForm` — Student name, Student ID (optional), Course as a 2×2
   segmented control (AA SL / AA HL / AI SL / AI HL), "Create exploration".
3. `ExplorationList` — each row: student name + `SUBJECT LEVEL · N drafts`.

**Right detail (`ExplorationDetail`):**
- Student header (name + `Mathematics {subject} {level}`).
- `PdfDropZone` — drag & drop or click; PDF only, max 32 MB; shows file name + size.
- "Submit draft" → stored as draft #N.
- Drafts list, newest first. Each `DraftCard`:
  - Draft #, submitted date, word count, ~page count, PDF badge.
  - 3-line text preview.
  - Then four stacked panels (this stacking is a key UX problem — see §6):
    `OriginalityCoach`, `SimilarityCheck`, `AiAuthorshipAdvisory`, `AuthenticityPanel`.

**AuthenticityPanel (the core flow):**
- Status pill: **not checked** (amber) / **passed** (green) / **blocked** (red).
- Teacher records Turnitin **similarity %** and **AI-content %** (for reference; the
  gate passes at any %).
- **Scoring gate:** "Score this draft" is **locked** (🔒) until the check is recorded.
- When unlocked → "Score this draft" calls the model (can take ~1 min) →
  renders `ScoreFeedback` with the A–E results.

### Screen B — Validation harness (`ValidationView`)

- `BulkImport` — import past explorations.
- "Validate against known marks": pick an exploration → enter **teacher marks** for
  A–E (numeric inputs, each capped at its max) → optionally add **IB moderated marks**
  → "Run validation" → shows **per-criterion agreement** (engine vs teacher vs IB).
- A **summary** aggregates agreement stats across all validated explorations.

---

## 4. Domain model — the five criteria & three confidence tiers (design-critical)

Total = **20 marks**. Each result carries a `mark`, a short `reasoning` line, and an
`improvement` suggestion tied to the next band up. **The confidence tier is as
important as the mark** and already drives how each result is surfaced:

| Crit | Name                  | Max | Tier   | UI requirement |
|------|-----------------------|-----|--------|----------------|
| A    | Presentation          | 4   | high   | Definite mark, shown plainly. |
| B    | Communication         | 4   | high   | Definite mark, shown plainly. |
| C    | Personal engagement   | 3   | low    | **Suggested range**, never a single number; always flagged for mandatory teacher review. |
| D    | Reflection            | 3   | medium | Mark + a **boundary flag** when it sits between two bands. |
| E    | Use of mathematics    | 6   | medium | Mark + boundary flag when borderline. |

Extra per-result fields the UI must express: `review_recommended` (bool) + `boundary_note`
(D/E), and `range_low`/`range_high` (C only). `ScoreFeedback.jsx` renders these and is the
**single highest-value surface** to redesign (meters vs max, tier colour, flags, C-range).

---

## 5. Current design system (as-is — a starting point to evolve, not preserve)

**Palette — monochrome slate + ad-hoc status colours** (Tailwind defaults):
- Page bg `slate-50 #f8fafc`; surfaces `white`; borders `slate-200 #e2e8f0`.
- Text `slate-900 #0f172a`; muted `slate-400/500`.
- Primary action/active = solid near-black `slate-900` (there is **no real accent colour**).
- Status: green = gate passed; amber = not checked; red = blocked / error.

**Typography:** system sans only (`ui-sans-serif, system-ui, -apple-system…`). Sizes
are mostly `text-sm` (14) and `text-xs` (12); headings differ by **weight/colour only**,
not size — so hierarchy is flat.

**Components/conventions:** cards `rounded-lg` + hairline border + `shadow-sm`;
buttons/inputs `rounded-md`; segmented control for course; dashed drag-drop zone;
status pills. **No dark mode** (`color-scheme: light` is hard-set).

**API surface** (so you know the data shapes the UI renders): folders, explorations
(`student_name, subject, level, current_draft_number, draft_count`), drafts
(`draft_number, word_count, page_count, source_kind, authenticity_*`), scores
(`criterion, engine_mark, max_mark, confidence_tier, reasoning_summary,
improvement_suggestion, review_recommended, boundary_note, range_low, range_high`),
validation comparisons.

---

## 6. Where the design pass should go (prioritised)

1. **[Highest] Design `ScoreFeedback` as the hero surface.** The A–E results are why
   the tool exists but render as plain text. Give each criterion a card with a
   mark-against-max meter, tier colour, reasoning + improvement, and clear treatments
   for the D/E **boundary flag** and the C **suggested range**. Show the /20 total up top.
2. **[Highest] A semantic language for confidence & state.** high/medium/low, gate
   passed/blocked/not-checked, "review recommended" — one consistent colour + shape
   system, kept separate from the brand accent, so what needs attention reads at a glance.
3. **[Highest] Tame the four stacked panels per draft.** Originality / Similarity /
   Authorship / Authenticity+Score currently stack into one long undifferentiated
   column. Group them (tabs / accordion / right rail) and make the primary path
   (gate → score) obviously primary.
4. **[High] A real type scale & a chosen palette** (one accent that means something;
   neutrals with a slight hue bias, not pure grey).
5. **[High] Add dark mode** (token-level; teachers grade at night). Status/tier colours
   must stay legible on a dark ground.
6. **[High] Responsive + empty/loading/error states.** The dense two-column layout and
   numeric mark grids need real mobile treatment; loading ("assessing with Claude — up
   to a minute"), empty, and error states are minimal placeholders today.
7. **[High] Small truths & a11y.** Fix the stale `Mathematics AI · MVP` badge; raise
   `slate-400` text contrast and focus visibility to WCAG AA.

---

## 7. Hard constraints

- Keep the React + Tailwind structure; **evolve tokens/components, don't rebuild.**
- **Never** present a score as final/authoritative — advisory framing is a feature.
- Don't change API response shapes or the routes.

---

## Appendix — recent engineering (why the frontend is ready for this pass)

The backend was just migrated to **Supabase Postgres + Storage** and made deployable
on **Vercel** (serverless), model defaulted to Sonnet. The **frontend was intentionally
left untouched** — which is exactly why it's ripe for a design pass. No visual code changed.
