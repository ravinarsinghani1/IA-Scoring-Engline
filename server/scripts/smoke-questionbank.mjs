#!/usr/bin/env node
/**
 * Live smoke test for Question Bank generation.
 *
 * ⚠️  THIS MAKES REAL, BILLED ANTHROPIC API CALLS. It is deliberately NOT part
 *     of `npm test` — the unit suite stubs the model boundary and must stay
 *     free and offline. Run this by hand when generation logic, the prompt, the
 *     model, or the output budget changes.
 *
 * Why it exists: the stubbed suite encodes our assumptions about model
 * behaviour. Every defect in commit 828ca02 — a vendor-detail error leak, two
 * output-budget truncations, and three validator false positives — passed the
 * stubs and was only caught here. Re-run it after changes that could alter what
 * the model actually returns.
 *
 * Usage (from server/):
 *   npm run smoke:questionbank        # all cases  (slow + costly: ~10 min)
 *   npm run smoke:questionbank -- 1   # one case by number
 *
 * Requires ANTHROPIC_API_KEY in server/.env. Model is QUESTION_BANK_MODEL,
 * falling back to SCORING_MODEL.
 *
 * Expect minutes per case: a 20-mark Paper 3 took ~280s at the 64k budget.
 * A non-zero exit means at least one case failed.
 */

import 'dotenv/config';
import { generateQuestion, QUESTION_BANK_MODEL } from '../src/services/questionBank/generate.js';
import { findSubtopic } from '../src/services/questionBank/taxonomy.js';

/**
 * Representative sample across paper types, courses and topic shapes.
 * Case 4 is deliberately awkward: an abstract topic with essentially no
 * real-world framing, to see whether generation degrades gracefully.
 */
const CASES = [
  {
    name: '1. AA SL — Section A style (short, non-calculator P1)',
    req: { course: 'AA', level: 'SL', paper: 'P1', subtopicCodes: ['SL2.7'],
           difficultyPosition: 'early', targetMarks: 6 },
  },
  {
    name: '2. AI HL — Section B style (extended, GDC paper)',
    req: { course: 'AI', level: 'HL', paper: 'P2', subtopicCodes: ['AHL4.19'],
           difficultyPosition: 'late', targetMarks: 15 },
  },
  {
    name: '3. AA HL Paper 3 — investigative',
    req: { course: 'AA', level: 'HL', paper: 'P3', subtopicCodes: ['AHL5.19'],
           difficultyPosition: 'late', targetMarks: 20 },
  },
  {
    name: '4. AWKWARD — proof by induction (abstract, no real-world framing, non-calculator)',
    req: { course: 'AA', level: 'HL', paper: 'P1', subtopicCodes: ['AHL1.15'],
           difficultyPosition: 'mid', targetMarks: 8 },
  },
];

/** Render a generated question the way a reviewer wants to read it. */
function render(q) {
  const out = [];
  out.push(`  tags: ${q.subtopicCodes.map((c) => `${c} — ${findSubtopic(q.course, c).description}`).join('; ')}`);
  out.push(`  ${q.course} ${q.level} ${q.paper} | calculatorAllowed=${q.calculatorAllowed} | incline=${q.difficultyPosition} | ${q.totalMarks} marks`);
  out.push('');
  for (const p of q.parts) {
    out.push(`  ${p.label} [${p.commandTerm}] (${p.marks} marks)`);
    out.push(`      ${p.prompt}`);
    out.push('      MARK SCHEME:');
    if (Array.isArray(p.alternativeMethods)) {
      for (const m of p.alternativeMethods) {
        out.push(`        ${m.label}`);
        for (const l of m.lines) out.push(`          ${l.annotation.padEnd(6)} ${l.text}`);
      }
    } else {
      for (const l of p.markSchemeLines ?? []) out.push(`        ${l.annotation.padEnd(6)} ${l.text}`);
    }
    out.push(`      ${p.allocationLine}`);
    out.push('');
  }
  out.push(`  ${q.totalLine}`);
  return out.join('\n');
}

const which = process.argv[2];
const selected = which ? [CASES[Number(which) - 1]] : CASES;

if (which && !selected[0]) {
  console.error(`No such case "${which}". Valid: 1..${CASES.length}`);
  process.exit(2);
}

console.log(`MODEL: ${QUESTION_BANK_MODEL}\n`);

let failures = 0;

for (const c of selected) {
  console.log('='.repeat(78));
  console.log(c.name);
  console.log('='.repeat(78));
  const t0 = Date.now();
  try {
    const { question, warnings, attempts } = await generateQuestion(c.req);
    const secs = ((Date.now() - t0) / 1000).toFixed(1);
    console.log(`RESULT: PASSED validation | attempts=${attempts}${attempts > 1 ? '  <-- NEEDED RETRY' : ''} | ${secs}s`);
    console.log(`WARNINGS (${warnings.length}):`);
    for (const w of warnings) console.log(`   - [${w.check}] ${w.message}`);
    console.log('');
    console.log(render(question));
  } catch (err) {
    failures++;
    const secs = ((Date.now() - t0) / 1000).toFixed(1);
    console.log(`RESULT: FAILED (${err.status}) after ${secs}s`);
    console.log(`  ${err.message}`);
    if (err.validationErrors) {
      for (const e of err.validationErrors) console.log(`   - [${e.check}] ${e.message}`);
    }
  }
  console.log('');
}

if (failures > 0) {
  console.error(`${failures} of ${selected.length} case(s) FAILED.`);
  process.exit(1);
}
