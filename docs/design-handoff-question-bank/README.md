# Handoff: Saaryavi Question Bank

## Overview
Saaryavi Question Bank is a new module inside the existing Saaryavi School product (an IA-scoring tool for IB DP teachers). It generates original, exam-calibrated DP Mathematics questions (Analysis & Approaches / Applications & Interpretation, SL & HL), styled to match real IB exam conventions (command terms, mark allocations, mark-scheme mechanics) — without reproducing any actual IB content. v1 is a generation tool, not a saved library.

## About the Design Files
The bundled file (`Saaryavi-Question-Bank.dc.html`) is a **design reference built in HTML** — a working prototype demonstrating layout, states, and interactions, not production code to copy directly. It uses a custom internal templating runtime (not React/Vue source) purely to make the prototype interactive in the browser. The task is to **recreate this design in the target codebase's actual environment** (React, Vue, native, etc., whichever the product already uses — or the most sensible choice if none exists yet), using real math typesetting (KaTeX or MathJax), real state management, and a real PDF/Word export pipeline.

> **Status (repo note — added by maintainer, not part of the Design export):** Design scoping in progress as of 2026-07-19 — treat as a working draft, not a final handoff, until confirmed otherwise. Open items still being resolved: cover-page, formula-booklet, and answer-space handling.

## Fidelity
**High-fidelity.** Colors, typography, spacing, and component states are final and should be recreated pixel-for-pixel. All math notation should render as genuine typeset notation (fractions, exponents, integrals, vectors, matrices) via KaTeX — the prototype already uses KaTeX (`katex@0.16.9` via CDN) for this, so the same rendering approach should carry over.

## Design System (reused from Saaryavi School, not invented)
- **Colors**: Primary navy `#12333A`, sage accent `#5C8F7E`, cream app background `#F7F5F1`, white cards `#FFFFFF`, neutral border `#E0DCD3` / `#DED9CF`, muted text `#6C6E66`, body text `#2B2B28`, sage tint bg `#EDF3F0` / text `#2F5C4C`, amber/advisory tint bg `#F3E1D8` / text `#8A4A2E`, examiner-insight accent `#B08B5A`.
- **Typography**: Headings — `'Source Serif 4'`, serif, weight 700. Body/UI — `'Libre Franklin'`, sans-serif, weights 400–700. Loaded via Google Fonts.
- **Radii**: 6px (buttons, inputs, chips-small), 8px (cards, topic rows), 10–14px (larger panels/modals). Pills fully rounded (20px+).
- **Shadows**: Minimal — cards mostly rely on 1px borders, not shadows. Floating elements (tray, dropdown, modal) use soft shadows, e.g. `0 12px 32px rgba(18,51,58,.18)`.
- **Logo**: rotated sage square (border-radius 6px, rotate 45deg) with a cream circle inset (counter-rotated), paired with the serif "Saaryavi" wordmark — reuse the real mark from Saaryavi School, don't redraw.

## Screens / Views

### 1. App shell (persistent on all views)
- **Layout**: Fixed left sidebar, 236px wide, navy `#12333A` background, full height, `padding: 26px 18px`, flex column.
  - Logo row (icon + "Saaryavi" wordmark), small uppercase "Question Bank" sub-label in `#8FB0A5` under it.
  - Nav list: IA, EE, TOK, CAS, RP, PP (existing Saaryavi School sections, inactive/muted `rgba(247,245,241,.7)`), plus a new **Question Bank** entry, marked active (`background: rgba(255,255,255,.1)`, white text, bold). Each row: 6×6px square bullet icon (`currentColor`) + label, `padding: 9px 12px`, `border-radius: 6px`.
  - Footer (pinned to bottom via `margin-top:auto`): 34px circular avatar (sage bg, white initials), name "Priya Anand" (bold, 13.5px, white) + role "DP Mathematics Teacher" (11px, muted white) below a 1px top divider.
- Main content area offset by `margin-left: 236px`, `padding: 44px 56px 140px`, `max-width: 920px`.

### 2. Generate screen (default view)
- Breadcrumb: small uppercase "Question Bank" label, sage, bold, 12px.
- H1 "Generate a question" (Source Serif 4, 32px, 700, navy) + one-line description (15px, muted).
- **Course & Level selectors**: two segmented-control groups side by side. Each is a pill-shaped container (`background:#EDEAE2`, `border-radius:8px`, `padding:3px`) holding 2 buttons; active = navy fill + cream text, inactive = transparent + muted text. Course: Math AA / Math AI. Level: SL / HL.
- **Topic picker**: a bordered white card (`border:1px solid #E0DCD3`, `border-radius:8px`) listing 5 major topics (Number & Algebra, Functions, Geometry & Trigonometry, Statistics & Probability, Calculus), each expandable to reveal a full syllabus subtopic list (each subtopic real IB-style numbering, e.g. "AHL 3.12 — Vector equations of lines in three dimensions") as independently checkable rows. Topic header row shows a rotating chevron + topic name + "N selected" badge (sage tint) when subtopics are checked.
- **Paper style selector**: 3 selectable cards (flex row, wrap) — Paper 1 (short-response), Paper 2 (extended-response), Paper 3 (investigative, HL-only — disabled/greyed when level = SL). Selected card: `border:2px solid #12333A`, tint background `#EDF3F0`.
- **Calculator note**: small italic muted text below paper style, computed automatically from paper style (never a toggle) — e.g. "No calculator — matches Paper 1 conventions."
- **Incline of difficulty**: 3 selectable pill-cards using IB's own descriptive language — "Starts straightforward" / "Moderate throughout" / "Builds to a demanding final part" (no tier badges like Easy/Medium/Hard).
- **Generate button**: navy, bold, disabled (grey) until at least one subtopic is checked.

### 3. Generated question view
- "← New question" link (top-left) returns to the generate screen preserving prior selections.
- **Display options** button (top-right) opens a dropdown panel (280px wide, white card, shadow) with 6 toggle switches (36×20px pill switches, navy = on): Question, Reference code, Space for student answers, Mark scheme, Examiner insight, Warnings. Defaults: Question on, Reference code on, Answer space off, Mark scheme on, Examiner insight off, Warnings on.
- **Warnings banner** (if on): amber/tan chip, full-width, "Practice question — generated to match exam conventions, not an official IB paper."
- Topic/course/paper-style chips (sage-tinted pills) + total-marks badge (navy pill) top-right.
- Reference code (if on): small monospace grey line, e.g. `QB.AAHL.AHL5.9.1a2b`.
- Command terms line: plain muted text, e.g. "Command terms: Find · Determine".
- **Question card** (if Question on): white card, serif body text, 16px/1.9 line-height, stem paragraph followed by labelled parts (a)(b)(c), each with marks right-aligned in `[N]` format. All math rendered via KaTeX (inline and display mode).
- **Space for student answers** (if on): bordered card with ruled lines per part (line count scales with marks), for print/practice use.
- **Mark scheme** (if on): collapsible accordion, closed by default, chevron rotates on open. Each part shows M1/A1/R1-style marking lines (small sage-tinted code chip + description), left-bordered in sage.
- **Examiner insight** (if on): tan-tinted card, one note per part explaining common errors / what earns the mark, left-bordered in `#B08B5A`.
- Actions row: "+ Add to paper" (sage-filled, becomes "✓ Added to paper" tinted state once added), "↓ Export PDF" and "↓ Export Word" (outlined navy icon-buttons) — direct actions, no modal at this stage.
- Footer line: "Incline of difficulty: …" (italic, muted).

### 4. Paper builder tray (persistent, floats over all views)
- Fixed bottom-right. Collapsed = navy pill button "Paper builder · N · M marks" with shadow.
- Expanded = white card (380px, max-height 58vh, scrollable) above the pill: header + close (×), list of accumulated questions (drag-handle glyph `⋮⋮`, reference code + topic name, marks pill, remove ×), running total row, a small proportion bar per major topic (actual % vs 20% even-target label), and an "Export paper" button (navy, full-width) that opens the export modal. Empty state: muted instructional text.

### 5. Export paper modal (full-paper export only)
- Centered modal over a dark navy scrim (`rgba(18,51,58,.45)`), click-outside or × closes it.
- **Cover page preview** panel (tan-tinted card) showing: title "Saaryavi Question Bank — Practice Paper", generation date, two blank candidate-info boxes (name / number), standard instruction line, and a footer row with question count + total marks — mirrors a real IB exam cover page's structure (candidate boxes, instructions, total-marks box).
- Two choice-cards side by side: **PDF** ("styled like a printed IB exam paper") and **Word (.docx)** ("fully editable"), each with an icon, title, description; clicking exports and closes the modal.
- Single-question export (screen 3) intentionally bypasses this modal — it's two direct buttons instead.

## Interactions & Behavior
- Clicking a course/level pill switches the segmented control's active state instantly (no animation needed beyond a color swap).
- Selecting level = SL auto-clears paper style away from "Paper 3" if it was selected (P3 is HL-only).
- Topic row header click toggles expand/collapse (rotate chevron 90°, `transition: transform .15s`).
- Checkbox click toggles that subtopic's selected state; topic header shows a live "N selected" count.
- Generate button is disabled until ≥1 subtopic is checked; on click, picks a question and switches to the Generated Question view.
- "Reveal mark scheme" toggles an inline accordion (chevron rotates 90°, height animates open/closed).
- "Add to paper" pushes the current question into the paper-builder tray's list and auto-opens the tray; re-clicking after it's already added shows a disabled "✓ Added to paper" state instead of duplicating.
- Export actions (single-question and full-paper) should trigger a brief toast/snackbar confirmation (bottom-right, navy, auto-dismiss ~2s) rather than a silent action.
- Paper-builder tray toggle button always shows current item count + mark total once non-empty.
- Display-options dropdown closes on toggling? No — keep it open until the user clicks the "Display options" button again or clicks elsewhere (implementer's choice; prototype keeps it open).

## State Management
Suggested state shape (adapt to the target framework's conventions):
- `course` ('AA' | 'AI'), `level` ('SL' | 'HL')
- `paperStyle` ('A' | 'B' | 'P3' — i.e. Paper 1/2/3), `difficulty` ('straightforward' | 'moderate' | 'demanding')
- `expandedTopics: { [topicId]: boolean }`, `selectedSubtopics: { [subtopicId]: boolean }`
- `view` ('generate' | 'result'), `generatedQuestion: object | null`
- `markSchemeOpen: boolean`, `viewOptionsOpen: boolean`
- `displayOptions: { question, referenceCode, answerSpace, markScheme, examinerInsight, warnings }` (all boolean)
- `paperItems: Array<{ id, sourceQuestionId, topicCode, topicName, marks, majorTopic }>`
- `trayOpen: boolean`, `exportModalOpen: boolean`
- Toast/snackbar state (`message`, `visible`) with auto-dismiss timer

## Question Data Model
Each generatable question needs:
```
{
  subtopicId, subtopicCode, subtopicName, course, level, paperStyle, difficulty,
  totalMarks,
  stem: [{ text } | { math: latex, display?: bool }, ...],
  parts: [{ label, marks, commandTerm, examinerNote, segments: [same shape as stem] }],
  markScheme: [{ lines: [{ code: 'M1'|'A1'|'R1'|..., segments }] }]  // one entry per part, same order
}
```
The prototype ships 3 fully worked sample questions (Calculus/Kinematics AHL 5.9, Vectors AHL 3.12, Normal Distribution SL 4.7) as reference examples for tone, structure, and mark-scheme granularity — real question generation (LLM-backed) should follow this same shape.

## Topic Data
Full 5-topic / ~12–14-subtopic-each syllabus tree is defined in the prototype's `TOPICS` constant, using representative IB-style numbering (SL 1.1–1.6, AHL 1.7–1.12, etc. per topic). This is **not verified against the official current subject guide** — cross-check subtopic numbering/names against the official AA and AI subject guides before shipping, and swap in the exact wording if it differs.

## Design Tokens
| Token | Value |
|---|---|
| Navy | `#12333A` |
| Sage | `#5C8F7E` |
| Cream (app bg) | `#F7F5F1` |
| Border | `#E0DCD3` / `#DED9CF` |
| Muted text | `#6C6E66` |
| Body text | `#2B2B28` |
| Sage tint bg / text | `#EDF3F0` / `#2F5C4C` |
| Amber tint bg / text | `#F3E1D8` / `#8A4A2E` |
| Examiner-insight accent | `#B08B5A` |
| Heading font | 'Source Serif 4', 700 |
| Body font | 'Libre Franklin', 400–700 |
| Small radius | 6px |
| Card radius | 8–10px |
| Modal/tray radius | 12–14px |

## Assets
- Fonts: Google Fonts — `Source Serif 4` (600, 700), `Libre Franklin` (400–700).
- Math typesetting: KaTeX 0.16.9 (CSS + JS via CDN in the prototype; recreate with KaTeX or MathJax in the target stack).
- No custom icons/images — all icons are minimal inline shapes (chevrons, squares, ×) drawn directly, no icon library required.
- Saaryavi logo mark (rotated sage square + cream circle inset) — reuse the real asset from the existing Saaryavi School codebase; it is recreated inline with CSS in the prototype for demo purposes only.

## Files
- `Saaryavi-Question-Bank.dc.html` — the full interactive prototype (single file). Open directly in a browser to review all states: generate screen, generated question (with display-options panel, mark scheme, examiner insight, answer space), paper-builder tray, and the full-paper export modal with cover-page preview.
