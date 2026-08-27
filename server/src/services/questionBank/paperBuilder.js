// Tests: server/test/questionBank/paperBuilder.test.js  (run: npm test, from server/)
//
// Assembles a full worksheet/paper from multiple independently-generated,
// independently-validated questions. Each question goes through the exact same
// generate → validate → (retry once) pipeline as a single-question request
// (generate.js) — nothing here relaxes that guarantee. No question is ever
// added to a paper unvalidated.
//
// NO SECTION A / SECTION B: a paper is a flat, ordered list of questions
// (1, 2, 3, …), not grouped into sections. That split is a specific real-paper
// convention this tool deliberately does not reproduce.
//
// Two modes:
//   - Worksheet (default, §2.5): targetMarks is whatever the teacher asks for.
//     NOT tied to a real exam's total — §2.5 is explicit that worksheet-first
//     is the default, and this has been true since paperTypes.js was written.
//   - Full paper (examSimulation: true): targetMarks is pulled from the
//     paper's REAL total (paperTypes.examSimulationTarget) — 80 (SL P1/P2),
//     110 (HL P1/P2), or 55 (HL P3). The caller cannot override this in
//     examSimulation mode — the whole point is matching the real exam.
//
// FLAGGED FOR REVIEW (not a silent decision): the per-question mark bounds
// below (sizeBoundsFor) and the ruled-line spacing heuristic in export.js are
// v1 defaults, not verified against real average IB question counts per
// paper. They are deliberately NOT derived from any copyrighted IB source
// (see generate.js's system prompt and docs/gap-analysis.md decision #4) —
// they're a reasonable planning heuristic, not a claim of exact IB convention.
// Worth calibrating against real domain expertise before relying on the
// exact shape of a "full paper" build.
//
// FLAGGED FOR REVIEW: if any one question in a planned paper fails validation
// on both of its attempts, buildPaper() aborts the ENTIRE paper rather than
// returning a partial one. This matches the existing single-question
// principle ("never serve unvalidated content") extended to "never serve an
// incomplete paper silently" — but it does mean one bad slot costs the whole
// build (a teacher must retry from scratch, not just that question). This was
// a judgment call, not something the rulebook specifies either way.

import { findPaperType, examSimulationTarget } from './paperTypes.js';
import { subtopicsFor, subtopicsByTopic } from './taxonomy.js';
import { topicWeights } from './weighting.js';
import { generateQuestion } from './generate.js';
import { DIFFICULTY_POSITIONS } from './validate.js';

function badRequest(message) {
  const err = new Error(message);
  err.status = 400;
  err.expose = true;
  return err;
}

/**
 * Per-question mark bounds, by paper type. P3 is IB's investigative paper —
 * by long-standing convention a small number of large, multi-part extended
 * problems, not many short questions, so it gets a much wider band than
 * P1/P2. See the FLAGGED comment above the top of this file.
 */
function sizeBoundsFor(paper) {
  if (paper === 'P3') return { min: 15, max: 30 };
  return { min: 4, max: 20 };
}

/**
 * Split a total into a sequence of individual question sizes, each within
 * [min, max], summing to exactly `totalMarks`. Deterministic given the same
 * input — no randomness here (randomness lives in topic assignment instead).
 */
export function planQuestionSizes(totalMarks, { min, max } = sizeBoundsFor('P1')) {
  if (totalMarks < min) return [totalMarks]; // smaller than one normal question — build just the one
  const sizes = [];
  let remaining = totalMarks;
  while (remaining > 0) {
    if (remaining <= max) {
      // Last slot. If it would be an awkwardly tiny trailing question, fold it
      // into the previous one instead of emitting a sub-`min` question.
      if (remaining < min && sizes.length > 0) {
        sizes[sizes.length - 1] += remaining;
      } else {
        sizes.push(remaining);
      }
      remaining = 0;
    } else {
      let size = max;
      const rest = remaining - size;
      // Don't leave a next remainder below `min` — shrink this question so the
      // remainder lands exactly on `min` instead.
      if (rest > 0 && rest < min) size -= (min - rest);
      sizes.push(size);
      remaining -= size;
    }
  }
  return sizes;
}

/** Hamilton (largest-remainder) allocation of `count` items across arbitrary
 *  weighted rows. Mirrors weighting.js's allocateByWeight, but generalised to
 *  an arbitrary (possibly caller-restricted) set of rows rather than always
 *  all five topics — needed because a paper's sub-topic pool may not cover
 *  every topic. */
function allocateCounts(rows, count) {
  const sumWeight = rows.reduce((s, r) => s + r.weight, 0);
  const exact = rows.map((r) => ({ ...r, raw: (r.weight / sumWeight) * count }));
  const allocated = exact.map((r) => ({ ...r, count: Math.floor(r.raw) }));
  let remaining = count - allocated.reduce((s, r) => s + r.count, 0);
  const byRemainder = [...allocated].sort(
    (a, b) => (b.raw - Math.floor(b.raw)) - (a.raw - Math.floor(a.raw))
  );
  for (let i = 0; remaining > 0; i = (i + 1) % byRemainder.length, remaining--) {
    byRemainder[i].count += 1;
  }
  return allocated.map(({ topic, name, count: n }) => ({ topic, name, count: n }));
}

/**
 * Decide which single sub-topic code each of `questionCount` planned
 * questions should draw on, honouring §2.1 topic weighting across whichever
 * topics are actually represented in `pool`. Returns an array of codes, one
 * per question, shuffled so consecutive questions aren't clumped by topic.
 */
function planTopicAssignment(course, level, pool, questionCount) {
  // subtopicsByTopic() groups are TOPICS entries spread with `...t`, so the
  // topic number is `.number`, not `.topic` (that field name is only used on
  // the flatter per-subtopic-entry shape elsewhere in taxonomy.js).
  const grouped = subtopicsByTopic(course, level);
  const eligible = grouped
    .map((g) => ({ ...g, subtopics: g.subtopics.filter((s) => pool.has(s.code)) }))
    .filter((g) => g.subtopics.length > 0);
  if (eligible.length === 0) {
    throw badRequest('No eligible sub-topics to build this paper from.');
  }

  const weightRows = topicWeights(course, level)
    .filter((w) => eligible.some((g) => g.number === w.topic))
    .map((w) => ({ topic: w.topic, name: w.name, weight: w.weight }));

  const counts = allocateCounts(weightRows, questionCount);

  const assignment = [];
  for (const { topic, count } of counts) {
    if (count === 0) continue;
    const codes = eligible.find((g) => g.number === topic).subtopics.map((s) => s.code);
    for (let i = 0; i < count; i++) assignment.push(codes[i % codes.length]);
  }
  for (let i = assignment.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [assignment[i], assignment[j]] = [assignment[j], assignment[i]];
  }
  return assignment;
}

/**
 * Validate a paper-build request. Throws 400 on any problem. Exported so the
 * SSE route can pre-flight before committing to a stream, same pattern as
 * generate.js's assertValidRequest.
 *
 * @returns {{course, level, paper, difficultyPosition, examSimulation, resolvedTargetMarks, pool: Set<string>}}
 */
export function assertValidPaperRequest(request) {
  const {
    course, level, paper, difficultyPosition = 'mid',
    examSimulation = false, targetMarks = null, subtopicCodes = null,
  } = request ?? {};

  if (course !== 'AA' && course !== 'AI') throw badRequest(`course must be 'AA' or 'AI'.`);
  if (level !== 'SL' && level !== 'HL') throw badRequest(`level must be 'SL' or 'HL'.`);
  if (!findPaperType(course, level, paper)) {
    throw badRequest(`${paper} is not an examinable paper for ${course} ${level}.`);
  }
  if (!DIFFICULTY_POSITIONS.includes(difficultyPosition)) {
    throw badRequest(`difficultyPosition must be one of ${DIFFICULTY_POSITIONS.join(' | ')}.`);
  }

  // Coerce loosely-typed JSON input at the API boundary rather than trusting
  // exact JS types from the caller. Two real failure modes this closes:
  //   - examSimulation as the STRING "false" is TRUTHY in JS (`if ("false")`
  //     passes) — would silently take the exam-simulation branch instead of
  //     the worksheet one.
  //   - targetMarks as a numeric STRING (e.g. "50") fails Number.isInteger,
  //     which only accepts the actual `number` type — rejecting a value a
  //     caller would reasonably consider valid.
  const examSimulationBool = examSimulation === true || examSimulation === 'true';
  const targetMarksNum =
    typeof targetMarks === 'string' && targetMarks.trim() !== '' ? Number(targetMarks) : targetMarks;

  let resolvedTargetMarks;
  if (examSimulationBool) {
    // §2.5 opt-in: the REAL exam total, not a caller-supplied value.
    resolvedTargetMarks = examSimulationTarget(course, level, paper, { examSimulation: true }).marks;
  } else {
    if (!Number.isInteger(targetMarksNum) || targetMarksNum < 1) {
      throw badRequest('targetMarks (a positive integer) is required unless examSimulation is true.');
    }
    resolvedTargetMarks = targetMarksNum;
  }

  const legalCodes = subtopicsFor(course, level).map((e) => e.code);
  let pool;
  if (subtopicCodes === null || subtopicCodes === undefined) {
    pool = new Set(legalCodes); // no restriction — draw from the whole course/level
  } else {
    if (!Array.isArray(subtopicCodes) || subtopicCodes.length === 0) {
      throw badRequest('subtopicCodes, if provided, must be a non-empty array.');
    }
    const legalSet = new Set(legalCodes);
    const illegal = subtopicCodes.filter((c) => !legalSet.has(c));
    if (illegal.length > 0) {
      throw badRequest(`These sub-topics are not available for ${course} ${level}: ${illegal.join(', ')}.`);
    }
    pool = new Set(subtopicCodes);
  }

  return { course, level, paper, difficultyPosition, examSimulation: examSimulationBool, resolvedTargetMarks, pool };
}

/**
 * Build one full paper: plan question sizes and topics, then generate each
 * question in sequence (each independently validated by generate.js). If ANY
 * question fails validation on both attempts, the whole build is aborted —
 * see the FLAGGED comment at the top of this file.
 *
 * @param {object} request  see assertValidPaperRequest
 * @param {object} [deps]
 * @param {object} [deps.client]  injectable Anthropic client (tests)
 * @param {(event: object) => void} [deps.onEvent]  lifecycle observer. In
 *          addition to generate.js's phases, emits:
 *            { type:'progress', phase:'plan', questionCount, targetMarks }
 *            { type:'progress', phase:'question-start', questionIndex,
 *              questionCount, subtopicCode, targetMarks }
 *          every generate.js event is re-emitted with questionIndex/questionCount
 *          attached so a caller can show "Question 3 of 6: generating".
 * @param {AbortSignal} [deps.signal]
 * @returns {Promise<{paper: object, warnings: object[], meta: object}>}
 */
// FLAGGED FOR REVIEW: how many questions generate concurrently. Each
// generateQuestion() call is 30s-3min (confirmed by live testing), and until
// this fix they ran one after another — for a 6-question paper that's the
// sum of all 6 calls' wall-clock time, easily 5-15+ minutes. Running several
// in parallel cuts that to roughly the slowest single call instead.
// 3 is a deliberate guess, not a measured rate limit: it's high enough to
// meaningfully help, low enough that one paper build can't alone saturate a
// typical account's requests-per-minute ceiling. Tune this — up if you have
// headroom and want it faster, down if you see 429 rate-limit errors.
const PAPER_CONCURRENCY = 3;

export async function buildPaper(request, deps = {}) {
  const { onEvent, signal: callerSignal } = deps;
  const emit = typeof onEvent === 'function' ? onEvent : () => {};

  const { course, level, paper, difficultyPosition, examSimulation, resolvedTargetMarks, pool } =
    assertValidPaperRequest(request);

  const sizes = planQuestionSizes(resolvedTargetMarks, sizeBoundsFor(paper));
  const assignment = planTopicAssignment(course, level, pool, sizes.length);

  emit({ type: 'progress', phase: 'plan', questionCount: sizes.length, targetMarks: resolvedTargetMarks });

  // One internal controller, not the caller's signal directly, so we can
  // cancel every other still-running question the instant ONE of two things
  // happens: the client disconnects (chained from callerSignal), or any
  // single question fails validation on both attempts (no point spending
  // more tokens generating questions for a paper that's already being
  // discarded — see the "abort whole paper" contract documented at the top
  // of this file, unchanged by parallelising).
  const internalController = new AbortController();
  if (callerSignal) {
    if (callerSignal.aborted) internalController.abort();
    else callerSignal.addEventListener('abort', () => internalController.abort(), { once: true });
  }

  // Pre-sized so results land at their PLANNED index regardless of which
  // question happens to finish first — the assembled paper's question order
  // must stay 1..N as planned, not "whichever the model returned quickest".
  const questions = new Array(sizes.length);
  const allWarnings = [];
  let totalAttempts = 0;
  let firstError = null;

  async function runOne(i) {
    if (internalController.signal.aborted) return;
    emit({
      type: 'progress', phase: 'question-start',
      questionIndex: i + 1, questionCount: sizes.length,
      subtopicCode: assignment[i], targetMarks: sizes[i],
    });
    try {
      const { question, warnings, attempts } = await generateQuestion(
        {
          course, level, paper,
          subtopicCodes: [assignment[i]],
          difficultyPosition,
          targetMarks: sizes[i],
        },
        {
          client: deps.client,
          signal: internalController.signal,
          onEvent: (e) => emit({ ...e, questionIndex: i + 1, questionCount: sizes.length }),
        }
      );
      questions[i] = { number: i + 1, ...question };
      for (const w of warnings) allWarnings.push({ questionNumber: i + 1, ...w });
      totalAttempts += attempts;
    } catch (err) {
      // Keep the FIRST real failure. Sibling questions cancelled by the
      // abort() below will each land here too, as abort errors — don't let
      // one of those overwrite the actual validation failure that caused it.
      if (!firstError) firstError = err;
      internalController.abort();
    }
  }

  let nextIndex = 0;
  async function worker() {
    while (nextIndex < sizes.length) {
      const i = nextIndex++;
      await runOne(i);
    }
  }

  const workerCount = Math.min(PAPER_CONCURRENCY, sizes.length);
  await Promise.all(Array.from({ length: workerCount }, worker));

  if (firstError) throw firstError;
  if (callerSignal?.aborted) {
    const err = new Error('Paper generation was cancelled.');
    err.status = 499;
    err.aborted = true;
    throw err;
  }

  const actualTotalMarks = questions.reduce((s, q) => s + q.totalMarks, 0);

  return {
    paper: {
      course, level, paper, examSimulation, difficultyPosition,
      targetMarks: resolvedTargetMarks,
      totalMarks: actualTotalMarks,
      questionCount: questions.length,
      questions,
    },
    warnings: allWarnings,
    meta: { totalAttempts, reviewRequired: allWarnings.length > 0 },
  };
}
