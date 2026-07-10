# IA Topic Feedback System (Form A review)

A repeatable process for turning a student's **Form A topic proposal** into a
standardized, one-page feedback sheet that steers the topic toward a top-band
(≈17–20/20, "7/7") exploration — *before* the student invests weeks of work.

This sits **upstream** of the scoring engine in this repo. The engine scores
finished drafts (steps 2–3 of the IA workflow); this reviews the raw topic
(step 0–1) so the exploration can actually *reach* the top band.

## The workflow (one candidate)

1. **Student submits Form A** (the 14-question proposal) as a PDF/doc.
2. **Teacher uploads it** into a Claude session.
3. **Claude reviews it** against [`reviewer-rubric.md`](reviewer-rubric.md) —
   the fixed internal checklist that keeps judgements consistent across
   candidates and across AA/AI · SL/HL.
4. **Claude fills** [`one-page-feedback-template.md`](one-page-feedback-template.md)
   with candidate-specific findings and produces a **one-page, editable
   document** for the teacher to review and send.
5. **Teacher reviews/edits** the one-pager and forwards it to the student.

## Files

| File | Purpose |
|---|---|
| [`reviewer-rubric.md`](reviewer-rubric.md) | The internal SOP: how any Form A is evaluated (criteria mapping, level nuances, trap library, verdict rules). Keeps every review consistent. |
| [`one-page-feedback-template.md`](one-page-feedback-template.md) | The fixed output structure. Every candidate gets the same clean layout. |
| `candidates/` | One markdown source per candidate (the filled template). Editable; the sendable document is generated from it. |

## Design principle

The template is **criterion-anchored** (A–E). Every strength and every fix ties
back to a specific IB assessment criterion, so the student sees exactly *which*
part of the mark it protects. That is what makes the feedback actionable rather
than generic encouragement.
