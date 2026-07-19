# Handoff: Saaryavi — IB DP IA Scoring Platform

## Overview
Saaryavi is a web platform for IB Diploma Programme teachers and coordinators to upload student Internal Assessments (starting with DP Mathematics, both AA and AI, SL and HL) and receive AI-generated criterion-level scoring and feedback benchmarked against the IB subject guide. It also unifies an earlier "topic guidance" step (Draft 1) and the scoring engine (Draft 2+) into one continuous per-student draft timeline, and gives Coordinators a lightweight whole-school supervisory view without duplicating the Teacher's scoring tools.

Audience: non-technical IB teachers and DP Coordinators, daily active users, evaluating this as a serious institutional purchase (tone closer to Turnitin/ManageBac than a consumer AI app).

## About the Design Files
The file in this bundle (`Saaryavi.dc.html`) is a **design reference** — an interactive HTML/React prototype built with a proprietary internal component runtime (Design Components), used only to communicate layout, states, copy, and interaction flow. **It is not production code and should not be copied directly.** Your task is to recreate these screens and flows in the target codebase's actual environment (e.g. React + a real backend, or whatever stack the project uses) using that codebase's existing component library, routing, and state-management patterns. If no frontend environment exists yet, choose the framework best suited to the project and implement the designs there.

The prototype uses inline styles throughout (a constraint of the authoring tool) — do not carry that pattern into production; use the target codebase's normal styling approach (CSS modules, Tailwind, styled-components, whatever is already established) while matching the visual values documented below.

## Fidelity
**High-fidelity.** Colors, typography, spacing, copy, and interaction states shown are intended to be final or near-final. Recreate pixel-close using the target codebase's design system/components where equivalents exist; where they don't, implement new components matching the values below.

All data shown (student names, scores, percentages, teacher names, dates) is realistic fabricated sample data for demonstration only — replace with real data-fetching logic.

## How to view the reference
Open `Saaryavi.dc.html` directly in a browser. It's a self-contained interactive prototype — no build step required. Screenshots of key states are in `screenshots/` for quick reference without needing to click through.

---

## Information Architecture

Four-level folder hierarchy for Internal Assessments:
**Component (IA/EE/TOK/RP/CAS/PP) → Subject (Mathematics) → Cohort Year (e.g. "2026 Cohort") → Draft Round (Draft 1/2/3)**

Breadcrumbs and search appear on every file-list-style screen, in the pattern:
`Internal Assessment / Mathematics / 2026 Cohort / Draft Round 2`

Mathematics course and level are **independent selectors**, not four hardcoded criteria sets:
- **Course**: AA (Analysis & Approaches) or AI (Applications & Interpretation) — determines which criteria set/rubric language applies.
- **Level**: SL or HL — used only for cohort filtering/reporting; does NOT change the criteria or mark scheme (both levels use the same A–E criteria structure).

---

## Roles & Scoping

### Teacher
- Sidebar shows only: **IA, EE, TOK, CAS, RP, PP** (component shortcuts — only IA is populated with real content; others are clickable but show "no data yet" roster screens), plus **My Class** at the bottom.
- Home dashboard ("Good morning/afternoon/evening, {name}" — time-of-day greeting computed client-side) shows only the teacher's own cohort folders, their own stats (Total IAs uploaded, Pending review, Average predicted score, Below-target flags), and their own recent submissions. No school-wide data.
- **My Class** (sidebar, bottom) is a landing screen of 6 component cards (IA, EE, TOK, CAS, RP, PP) each showing a count of enrolled students for that component, 2026 Cohort (e.g. IA 20, EE 10, TOK 5, CAS 5, RP 3, PP 2). Clicking the IA card opens the full IA submissions table (see File List below). Clicking any other component card opens a simple roster (Student name, Student ID, Status = "No submissions yet") with breadcrumb `My Class / {Component}`.
- No whole-school Cohort Dashboard link — Teachers only ever see their own students.

### Coordinator
- Sidebar's bottom item reads **"Whole School"** instead of "My Class" and opens the full cross-teacher Cohort Dashboard.
- **Login requires two-factor verification.** After Sign In (SSO or password), Coordinators are routed to a dedicated Two-Factor Verification screen (6-digit code sent to their registered school email) before reaching their Home. Teachers skip this step entirely — single-step login only, since their access is scoped to their own data.
- Coordinator Home shows a **subject-wise summary**: the six DP subject groups (Studies in Language and Literature, Language Acquisition, Individuals and Societies, Sciences, Mathematics, The Arts) plus DP Core (TOK/CAS/EE), each as a row with a total IA count. Only Mathematics is enabled/clickable; others show a "Coming soon" pill and are visually de-emphasized (opacity ~0.55, not clickable). No upload action and no recent-uploads list on this screen — it's a navigation/summary screen only.
- Clicking **Mathematics** opens a **Subject Detail** screen: a table of teachers (e.g. 4 Math teachers) each showing `{uploads} of {roster size}` and a **lagging-teacher flag** — a small pill reading "Last upload {N} days ago" in a warm/amber-red tone when a teacher hasn't uploaded recently (vs. plain grey "Last upload {X}" text when on track). Breadcrumb: `Home / Mathematics`.
- Clicking a **teacher's name** opens that teacher's upload table: Student Name | Similarity % | AI Writing % | Score (of 20) | Flag (small colored dot + short reason text for similarity/AI/score concerns — never a full red/green traffic light; keep it neutral). Breadcrumb: `Home / Mathematics / {Teacher Name}`.
- Clicking any **student row** from that table opens the same Individual File View used everywhere else (no separate Coordinator version) — full navigability down to a single submission.
- Coordinators have **no upload action anywhere** and no Topic-Guidance-specific reporting layer. The drill-down (Home → Subject → Teacher → Student) is intentionally a lightweight supervisory glance — resist adding more metrics here.
- The separate **Cohort Dashboard** (reached via "Whole School" in the sidebar) is the cross-teacher/cross-subject sortable view: table of all students sortable by Overall Score / Weakest Criterion / Most Improved / Most Declined, with a "Below target" flag pill for students under threshold. This is distinct from the drill-down — the drill-down is for structured browsing by subject/teacher, the Cohort Dashboard is for sorting/filtering the whole cohort at once.

### Student (referenced, not fully built in this prototype)
- Opt-in per school (toggle in Coordinator settings, off by default).
- Single-step login. Sees only their own submissions with status (Submitted / Reviewed / Feedback Available).
- Feedback view only reachable once a teacher explicitly shares it (see Share dialog below) — shows criterion feedback only, framed as feedback from their teacher. **Scores, totals, similarity %, AI-writing %, and authenticity data are never shown to students under any circumstance** — this is a hard rule, not a toggle.

---

## Auth Flow

1. **Sign In**: Google Workspace SSO (prioritized, shown first) or school email/password. A demo-only "Sign in as" Teacher/Coordinator segmented control is present in the prototype purely to let reviewers preview both roles — remove this in production; role is determined by the account record.
2. **Sign Up**: Google Workspace SSO or school email registration. Shows domain-verification messaging (e.g. "We'll verify this against your school's registered domain") — school-domain-locked registration.
3. **Forgot username/password** link on Sign In.
4. **First-login Role Picker** (single screen): "Teacher" vs "Coordinator" card selection, plus subject-assignment checkboxes (Math AA / Math AI; other DP subjects shown disabled/"coming soon"). Choosing Coordinator surfaces an inline note that two-factor verification will be required going forward.
5. **Two-Factor Verification** (Coordinator only): 6-digit code screen, shown after Sign In (or immediately after first-login role selection for a brand-new Coordinator). Teachers never see this screen.

---

## Upload Flow

Entry points: Home's "Cohort folders" → open a cohort year folder → choose a draft round card (**Draft 1 — Topic Draft**, **Draft 2 — Complete Draft**, **Draft 3 — Final Draft**) → each draft round offers two upload options:
- **Upload file** (single file, drag-and-drop or browse) — supported formats shown before upload: PDF or DOCX, up to 25MB.
- **Upload folder** (bulk/whole-class) — supported formats shown: a single .zip containing PDF/DOCX files, up to 100MB total.

Upload steps: **Select** (drag-drop/browse with visible format constraints) → **Confirm** (Subject fixed to Mathematics; Course AA/AI and Level SL/HL as two independent segmented controls; cohort year and draft round shown read-only from context; student name field) → **Processing** (spinner + "Running similarity check, AI-writing detection, and criterion-level scoring against the IB Mathematics subject guide") → **Done** (checkmark, "View Results" CTA into the Individual File View).

---

## The Unified Exploration Timeline (core IA feature)

This is the single most important IA information-architecture idea: **Draft 1 and Draft 2+ are the same per-student timeline, not two separate tools.**

The Individual File View header shows a **Draft selector strip** with one card per draft round (Draft 1, Draft 2, Draft 3 …). Each card shows the draft label, a one-line description, and a status line. Clicking a card swaps the content below between two very different layouts:

### Draft 1 — Topic Proposal Review (no score, ever)
Rendered whenever the selected draft is a topic-proposal stage (Draft 1, or any resubmitted revision of it). Contains, top to bottom, as one scrollable page:
- **Verdict banner** — one of three states, each visually distinct: **Approved** (calm green/teal), **Approved with revisions** (amber — the common case, should read as "good but not done," not a failure state), **Needs rework** (red/terracotta). One-line summary underneath.
- **What's Working** — 2–3 short strength bullets with a checkmark glyph.
- **Priority Revisions** — a numbered/bulleted list (3–5 items), each tagged with a small badge showing which IB criterion (A–E) it protects.
- **Checklist to a Top-Band Exploration** — five criterion sections (A Presentation, B Communication, C Personal Engagement, D Reflection, E Use of Mathematics), each with tickable checklist items specific to this topic.
- **Next Step** — one highlighted callout: the single thing the student must do/reply with to move forward.
- Action row: **Save Draft**, **Download 1-Page Feedback** (a clean single-page PDF-style export a teacher can hand to a student directly — no score anywhere on it), **Send to Student**.
- **No score or total appears anywhere on this screen.** Draft 1 is explicitly score-free by design — it's a topic-readiness gate, not a graded artifact.

### Draft 2+ — Score & Feedback (Scoring Engine)
Rendered for the full-exploration draft stage. Left side: document viewer (page-by-page PDF preview with prev/next). Right side: tabbed panel — **Score & Feedback | Similarity | AI Writing | Submission Details**.

**Score & Feedback tab** — the hero surface:
- Course/Level pills (Math AA/AI, SL/HL) and a "Compare to previous draft" toggle at the top.
- Accordion, one row per criterion (A–E, configurable per subject/component), each collapsed row showing:
  - A colored left-edge bar (neutral strength gradient — not red/green traffic-light, warm terracotta → amber → teal → deep teal across weak → developing → strong → excellent).
  - Criterion name and a **confidence-tier badge**: "High confidence" (teal), "Medium confidence" (amber), "Low confidence" (terracotta/red) — this is a deliberate, distinct visual language from the strength-gradient bar.
  - **High-confidence criteria** (e.g. A, B): a definite "Band X of Y" plus a small horizontal meter bar.
  - **Low-confidence criteria** (e.g. C — Personal Engagement, which is called out as the most important human-judgment differentiator): shown as a **suggested range** ("2–3 of 3"), never a single asserted number, plus a "Mandatory teacher review" badge that visually stands apart from the rest.
  - **Medium-confidence criteria** (e.g. D, E) additionally get a **boundary flag** ("⚠ Boundary — double-check") when the predicted mark sits right between two bands.
  - Expanding a row reveals quoted evidence (a verbatim excerpt from the student's text) and a concrete, specific improvement suggestion.
- **Total Score summary** — sum of all criteria out of the subject's configured maximum (e.g. "14 / 20") — positioned **below** all individual criteria (never asserted first), with a visible confidence caveat: "This predicted score is an AI-generated estimate … with a typical confidence range of ±1 mark. Final marks remain subject to teacher assessment and IB moderation." Every score display must carry this kind of caveat — never present a bare, certain number.
- **Share with Student** button at the bottom — opens a simple two-button dialog (see below).

**Similarity tab** — Turnitin-style layout: overall similarity ring/percentage, list of top matching sources with per-source percentage and a "View match" link.

**AI Writing tab** — same ring/list pattern, plus a **mandatory, visible false-positive disclaimer** ("AI-writing detection can produce false positives, particularly for non-native English writers … Use this indicator to prompt a conversation with the student — not as standalone evidence of misconduct.").

**Submission Details tab**: Class/Cohort ID, Assignment, Submission ID, Submission Date, Submission Count (e.g. "2 of 3 allowed drafts"), Student ID.

### Share with Student dialog
A simple two-button dialog (**Cancel / Share**), not a file picker. Copy explicitly states: *"Amara will see this draft's criterion feedback, framed as feedback from you. Scores, totals, similarity, AI-writing, and authenticity data are never shown to students — those remain teacher-only."* This is a strict, non-negotiable rule reflected in copy, not just a checkbox a teacher could miss.

---

## Download Panel (teacher-only exports)
Reached via the "Download ↓" button in the Individual File View header. Presents:
- A clearly labeled **two-option choice** (not a small checkbox) at the top: **"Teacher export"** (includes predicted band scores and total) vs. **"Student-safe export"** (scores and totals stripped, qualitative feedback only) — each option shown as its own selectable card with a one-line description, so the distinction is unmistakable at the point of download.
- Checkboxes below for which reports to include: Similarity report / AI writing report / Feedback report / Original submission.
- A footnote clarifying what "student-safe" strips vs. keeps.

---

## Design Tokens

**Colors**
- Deep teal/navy primary: `#12333A` (also a darker sidebar variant `#0C2226`, and `#1B3A3E` for active nav-item background)
- Muted teal-green accent: `#5C8F7E` (brand mark, icons, positive/high-confidence accents)
- Deeper accent teal used for emphasis text: `#3F6F60`
- Off-white background: `#F7F5F1`
- Warm greys: `#6C6E66` (secondary text), `#98988F` (tertiary/meta text), `#22282A` (primary text/near-black)
- Borders / warm neutral: `#E3DFD6`, `#D8D3C6`, `#EFECE3`
- Confidence-tier system (distinct from strength gradient): high = teal `#3F6F60` on `#EAF1EE`; medium = amber `#8A6A2E` on `#F7EFDD`; low = terracotta `#8A3F2E` on `#FBEAE3`
- Strength gradient (per-criterion left bar, neutral not red/green): weak `#C97A63`, developing `#C9A24B`, strong `#5C8F7E`, excellent `#3F6F60`
- Below-target/flag accent: `#B9694F`

**Typography**
- Display/serif (headings, wordmark): "Source Serif 4", serif — weights 600/700
- UI/body sans: "Libre Franklin", sans-serif — weights 400/500/600/700
- Base UI text: 13–14px. Section labels: 11–12px, uppercase, letter-spacing ~0.4px, weight 700, color `#6C6E66`. Page titles: 22–26px serif. Large stat numbers: 28–30px serif.

**Shape & spacing**
- Card/border radius: 6–8px throughout (buttons 6px, cards 8px, badges/pills fully rounded ~20px)
- Card borders: 1px solid `#E3DFD6` on white `#FFFFFF` cards, sitting on the `#F7F5F1` page background
- No gradients, no drop shadows beyond a very subtle document-page shadow in the PDF viewer panel
- Sidebar: 240px expanded / 72px collapsed (icon-only), toggled by clicking the wordmark/logo; smooth width transition

**Logo**
Small geometric diamond/rounded-square mark (teal `#5C8F7E`, rotated square with an inset circle) + "Saaryavi School" wordmark in Source Serif 4 bold, deep teal/navy on dark sidebar backgrounds, always top-left.

---

## State Management (reference implementation notes)
The prototype tracks (as flat client state, to be replaced by real auth/data fetching in production):
- Current screen/route, current role (teacher/coordinator), sidebar collapsed/expanded
- Selected Course (AA/AI) and Level (SL/HL) — independent
- Active tab within Individual File View (Score & Feedback / Similarity / AI Writing / Submission Details)
- Active draft within the unified timeline (Draft 1 / Draft 2 / Draft 3…)
- Per-criterion accordion expanded/collapsed state
- "Compare to previous draft" toggle
- Upload flow step (select → confirm → processing → done) — processing auto-resolves after ~2.2s in the demo; in production this is a real async job (similarity + AI-writing check + scoring), and the UI should poll/subscribe rather than use a fixed timer
- Cohort folder list (client-created in the demo; needs real persistence)
- Download panel export-type selection (teacher vs. student-safe) and per-report checkboxes
- Share-with-student dialog open/closed

## Assets
No external image/icon assets — the logo mark is drawn with plain CSS (rotated square + circle), and all "document preview" content in the PDF viewer is a placeholder (grey bars) representing where real rendered PDF pages will go. Fonts are loaded from Google Fonts (Source Serif 4, Libre Franklin).

## Files
- `Saaryavi.dc.html` — the full interactive design reference (open directly in a browser).
- `screenshots/` — static captures of key screens: Sign In, Teacher Home, My Class landing, IA File List, Individual File View (Draft 1 Topic Review, Draft 2 Score & Feedback), Share dialog. (Coordinator-specific screens — Two-Factor, Subject Detail, Teacher Detail, Cohort Dashboard — are fully specified above and viewable by clicking through the live HTML file; a tooling hiccup during capture prevented including static images of those specific screens in this bundle.)
