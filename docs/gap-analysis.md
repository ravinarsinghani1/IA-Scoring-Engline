# Saaryavi Platform — Gap Analysis & Phased Plan

> Compares the **Saaryavi design handoff** (`docs/design-handoff-saaryavi/`) against the
> current working codebase (the "IB Math IA Scoring Engine" MVP) and lays out a phased
> path to build the fuller platform.
>
> **Status of this doc:** planning only. No implementation code has been written.
> Phase 0 is expanded to a concrete, file-level task list in
> [`docs/phase-0-foundations.md`](phase-0-foundations.md). Phases 1–7 are intentionally
> left at outline level — they will shift once Phase 0 is actually built.

---

## 0. Source of truth

- **New spec:** `docs/design-handoff-saaryavi/README.md` + `Saaryavi.dc.html` + `screenshots/`.
  This is a **newer, expanded** spec than the older `docs/design-handoff.md` already in the
  repo — it adds the Coordinator role, whole-school views, the four-level folder hierarchy,
  the unified topic/score draft timeline, and auth (SSO, role picker, 2FA).
- **Question Bank spec (separate module):** `docs/design-handoff-question-bank/README.md` +
  `Saaryavi-Question-Bank.dc.html`. A **distinct, self-contained feature** — an
  LLM-backed generator for original, exam-calibrated IB DP Math questions (AA/AI · SL/HL)
  with mark schemes, examiner insight, a paper-builder tray, and PDF/Word export. It shares
  the app shell, auth, and visual system with the IA-scoring product but is **largely
  orthogonal to the IA pipeline** (Phases 2–6). Slotted as Phase 7 below.
- **Current app:** React 18 + Vite + Tailwind v4 client (single-screen teacher tool),
  Express 4 (ESM) + Postgres/Supabase server, Claude API scoring services.

The handoff's core instruction: **recreate the screens in this codebase's own patterns
(React + Tailwind), not copy the prototype's inline-styled HTML.**

---

## 1. Where we are today

**The backend already models more of the hard scoring semantics than the UI exposes.**

| Spec concept | Already in schema? | Where |
|---|---|---|
| Course AA/AI + Level SL/HL (independent) | ✅ | `exploration.subject`, `exploration.level` |
| Confidence tiers (high / medium / low) | ✅ | `criterion_score.confidence_tier` |
| Low-confidence **suggested range** (crit C) | ✅ | `criterion_score.range_low` / `range_high` |
| Medium **boundary flag** (crit D/E) | ✅ | `criterion_score.review_recommended` + `boundary_note` |
| Teacher override | ✅ | `criterion_score.teacher_override_mark` |
| "Compare to previous draft" | ✅ | `criterion_score.changed_since_last_draft` |
| Similarity % + AI-writing score + gate | ✅ | `draft.authenticity_*` |
| Draft numbering | ✅ | `draft.draft_number` |

**The frontend is a single-screen teacher tool:** flat folder bar + exploration list +
stacked detail panels, slate/sans styling, two tabs (Scoring / Validation). No auth, no
roles, no navigation shell, no ownership model.

---

## 2. Gap inventory (spec → current)

### A. Foundational — nothing exists yet (net-new, needs backend too)
- **Auth**: Sign In (Google SSO + email/pw), Sign Up (school-domain-locked), Forgot
  password, first-login **Role Picker**. No user/session model exists at all.
  *(Coordinator 2FA moved to Phase 5 — see note below.)*
- **Roles & scoping**: Teacher / Coordinator / Student. Schema has no `user` / `role` /
  `teacher_id` / `school_id` — every exploration is currently ownerless. **This is the
  biggest backend gap and blocks Coordinator + Student views.**
- **App shell**: collapsible sidebar (240 / 72px), component shortcuts
  (IA / EE / TOK / CAS / RP / PP), "My Class" vs "Whole School" bottom item, breadcrumbs.
- **Home dashboard**: time-of-day greeting + teacher stat tiles + recent submissions.

### B. IA structure — partial, needs rework
- **Four-level hierarchy** (Component → Subject → Cohort Year → Draft Round). Current
  folders are a single flat level → schema + IA change.
- **Named draft rounds** (Draft 1 Topic / Draft 2 Complete / Draft 3 Final) vs today's
  plain incrementing draft numbers.
- **Unified timeline w/ Draft-1 Topic Review** — the score-free verdict-banner / checklist
  layout. **Entirely net-new, front and back**: nothing in the schema stores topic-review
  verdict / strengths / priority-revisions / checklist. Called out in the spec as *the
  single most important IA idea*, and fully missing today.

### C. Individual File View — reorganization + new surfaces
- Split into **document viewer (page-by-page PDF) + tabbed panel** (Score / Similarity /
  AI / Submission Details). Today everything is stacked.
- Score accordion redesign: strength-gradient left bar, confidence badges, band meters,
  suggested-range display, boundary flags, evidence-on-expand, total-below-criteria with
  mandatory caveat. **Data exists; presentation must be rebuilt to spec.**
- **Share-with-student dialog** + student-safe rules — net-new.
- **Download panel** (Teacher vs Student-safe export cards + report checkboxes) — net-new.

### D. Coordinator surfaces — 100% net-new (gated on the user/role model in A)
- Subject-wise Home → Subject Detail (teachers table + lagging flag) → Teacher Detail →
  Student drill → Cohort Dashboard (sortable). Needs cross-teacher aggregation queries
  that don't exist yet.
- **Coordinator 2FA** (6-digit email code after Sign In) — see scope note below.

### E. Student role — referenced, not built
- Opt-in per school, feedback-only view. **Hard rule:** scores / totals / similarity /
  AI-writing / authenticity data are never shown to students.

### F. Visual system — full restyle
- Teal/navy + Source Serif 4 / Libre Franklin, warm off-white `#F7F5F1`, 6–8px radii, no
  shadows. Current is slate + system sans. Touches every component.

### G. Question Bank — 100% net-new module (separate from IA-scoring)
- **A new top-level section**, reached from a "Question Bank" sidebar entry, that
  *generates* questions rather than scoring student work — so it reuses the shell + auth
  + design tokens but shares almost nothing with the IA data model.
- **Scope (v1):** single-question generation + paper assembly only — see decision §4.5.
- **Full screen / state / component detail lives in the handoff**
  (`docs/design-handoff-question-bank/`) — generate screen, generated-question view,
  paper-builder tray, and export modal. Not duplicated here; this section captures scope
  and the net-new backend surface only.
- **New backend, none of it exists today:**
  - A **question-generation service** — a Claude prompt that emits the spec's question
    JSON shape (`stem` / `parts` / `markScheme` with LaTeX segments), calibrated to IB
    command terms and mark mechanics **without reproducing real IB content**.
  - A **topic/syllabus data source** — the 5-topic tree with IB-style numbering
    (prototype's `TOPICS` constant is *unverified* against the official subject guides and
    must be cross-checked before shipping).
  - A **PDF + Word export pipeline** (single question and full paper with an IB-style
    cover page). No export/render pipeline exists in the current app.
  - **KaTeX/MathJax** math typesetting on the client (new dependency).
- **v1 is a generation tool, not a saved library** — no persistence of generated questions
  is required for v1, which keeps the backend surface small (generation + export only).

---

## 3. Phased plan

> **Scope adjustment (per decision):** Coordinator 2FA is **moved out of Phase 0 into
> Phase 5**. 2FA only matters once the Coordinator role exists to protect; building it in
> the foundational phase is premature. Phase 0 focuses on core user / role / ownership
> schema + basic Sign In / Sign Up / Role Picker.

| Phase | Scope | Blocked on |
|---|---|---|
| **0 — Foundations** | `user` + `role` + `school` + ownership (`exploration.teacher_id`, `school_id`); auth backend + JWT verification; design-token layer; Sign In / Sign Up / Role Picker screens. **Fully expanded in [`phase-0-foundations.md`](phase-0-foundations.md).** | — |
| **1 — App shell + Teacher Home** | Sidebar, breadcrumbs, routing, My Class landing, Home dashboard with stats. Restyle to tokens as components are touched. | Phase 0 |
| **2 — IA hierarchy + File List** | Four-level folder model (schema migration), draft-round cards, file-list table (similarity / AI / score / flag columns). | Phase 0 |
| **3 — Individual File View (Draft 2+)** | Doc viewer + tabbed panel, redesigned score accordion, total + caveat, Share dialog, Download panel. Mostly frontend — data already exists. | Phase 2 |
| **4 — Draft 1 Topic Review** | New verdict / checklist layout **+ new backend**: topic-review data model + a Claude prompt returning verdict / strengths / priority-revisions / checklist instead of scores. | Phase 2 |
| **5 — Coordinator** | Cross-teacher aggregation endpoints + Subject / Teacher / Cohort dashboards. **+ Coordinator 2FA** (moved here from Phase 0). | Phase 0, Phase 3 |
| **6 — Student role** | Opt-in, feedback-only view enforcing the never-show-scores rule. | Phase 0, Phase 3 |
| **7 — Question Bank** | New sidebar section: generate screen + generated-question view (KaTeX, mark scheme, examiner insight), paper-builder tray, cover-page export modal. **+ new backend**: Claude question-generation service (spec's question-JSON shape, no real IB content), syllabus topic tree, single + full-paper PDF/Word export pipeline. See gap **§G**. | Phase 0, Phase 1 |

Phases 1–7 are deliberately left at this altitude. They will be expanded one at a time,
because the concrete shape of later phases is likely to shift once Phase 0 is built.

**On Phase 7's ordering:** Question Bank depends only on **Phase 0** (auth/role) and
**Phase 1** (app shell to host the sidebar entry) — *not* on the IA-hierarchy /
file-view / coordinator / student phases. It can therefore be built in parallel with
Phases 2–6, or pulled earlier, once 0 and 1 land. It is numbered last only because it is
a separate product surface, not because it is blocked by 2–6.

---

## 4. Decisions worth flagging

1. **The user / role / ownership model is the critical path.** Coordinator and Student
   views (Phases 5–6) are impossible until `exploration` is owned by a teacher and users
   carry roles + a school. Design this schema carefully before any Coordinator UI.
2. **Draft 1 Topic Review is net-new end-to-end** — the marquee feature with zero backing
   today (no data model, no prompt). Budget it as a real feature, not a screen.
3. **Rollback safety is a database question, not just a git question** — see below.
4. **Question Bank (Phase 7) has two hard constraints to lock before building.**
   (a) **No real IB content** — generated questions must match IB *conventions* (command
   terms, mark mechanics, cover-page structure) without reproducing any actual IB exam
   material; this is a prompt-design and review constraint, not an afterthought.
   (b) **The prototype's syllabus tree is unverified** — subtopic numbering/wording in the
   `TOPICS` constant must be cross-checked against the official AA and AI subject guides
   before shipping.
5. **Question Bank v1 scope is "Option A" — generation + assembly only.** v1 ships
   **single-question generation + paper assembly** and nothing more. Explicitly **deferred
   to a later phase, not included now**: (i) attempt-tracking, (ii) weak-topic targeting,
   and (iii) past-paper-statistics comparison. These are out of scope for the first
   release — do not build them into Phase 7 without a separate decision to expand scope.

---

## 5. Branch & rollback strategy

**A git branch protects the code; it does NOT protect the shared Supabase database.**
Schema changes run against whatever `DATABASE_URL` points to, on any branch. So the safe
path has two independent parts:

### Code
- All Phase 0+ work happens on branch **`feature/saaryavi-foundations`** (already created).
  `main` stays deployable. Rollback = `git checkout main`.

### Database (the real risk)
Pick one of these before running any migration — in order of safety:

1. **Separate Supabase project for dev** (recommended). Point the dev/branch `.env`
   `DATABASE_URL` at a throwaway Supabase project. The live project is never touched until
   the schema is proven. Rollback = nothing to roll back; prod DB was never altered.
2. **Supabase branching** (if on a plan that supports it) — a DB branch that merges when
   ready.
3. **Additive-only migrations on the shared DB** (minimum bar). Every Phase 0 change must
   be **new tables** or **nullable new columns with defaults**, applied via a *separate*
   migration file (never by editing `schema.pg.sql` in place), and must **not** alter or
   constrain existing `exploration` / `draft` / `criterion_score` columns in a way that
   breaks the current app. `exploration.teacher_id` / `school_id` must be **nullable**
   (existing rows have no owner) — a `NOT NULL` here would break the live app immediately.

The concrete migration mechanics (new `002_auth.sql` file, keeping `schema.pg.sql` as the
baseline, idempotency) are specified in [`phase-0-foundations.md`](phase-0-foundations.md).

**Bottom line:** use a separate Supabase project for development if at all possible; if you
must share the DB, Phase 0 is strictly additive + nullable so the current Scoring Engine
keeps working unchanged and any new object can simply be dropped to roll back.
