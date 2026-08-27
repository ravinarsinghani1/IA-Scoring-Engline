// Paper Builder — request validation, size/topic planning, and the
// "abort the whole paper on any single validation failure" contract. No
// network: the Anthropic client is injected as a stub (same pattern as
// generate.test.js).

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
  assertValidPaperRequest, planQuestionSizes, buildPaper,
} from '../../src/services/questionBank/paperBuilder.js';
import { findSubtopic } from '../../src/services/questionBank/taxonomy.js';

/** A minimal valid model output for a question worth `marks` in total. One
 *  1-mark annotation line per mark, so the mark-scheme validator's sum check
 *  passes regardless of size (real questions vary this; this stub doesn't
 *  need to — it only needs to be VALID, not realistic). */
function modelOutput(code, marks) {
  return {
    subtopicCodes: [code],
    totalMarks: marks,
    totalLine: `Total: [${marks} marks]`,
    parts: [
      {
        label: '(a)', commandTerm: 'Find', marks,
        prompt: 'Find the thing.',
        allocationLine: `[${marks} × A1 — ${marks} marks]`,
        markSchemeLines: Array.from({ length: marks }, (_, i) => ({
          annotation: 'A1', text: `Step ${i + 1}.`,
        })),
      },
    ],
  };
}

/** Stub client: returns modelOutput sized to whatever targetMarks the prompt
 *  asked for, by reading it back out of the request (the prompt text embeds
 *  "Aim for approximately N marks"). Falls back to a fixed size otherwise. */
function stubClient({ failOnCallIndices = null } = {}) {
  const calls = [];
  return {
    calls,
    messages: {
      stream: (args) => {
        const index = calls.length;
        calls.push(args);
        return {
          finalMessage: async () => {
            const promptText = args.messages[0].content;
            const codeMatch = promptText.match(/^\s*(\S+) \(/m);
            const marksMatch = promptText.match(/approximately (\d+) marks/);
            const code = codeMatch ? codeMatch[1] : 'SL5.9';
            const marks = marksMatch ? Number(marksMatch[1]) : 5;
            if (failOnCallIndices?.has(index)) {
              // Deliberately invalid: only one 1-mark annotation regardless of
              // the part's declared size — the real mark-scheme validator
              // rejects this (confirmed: this is the exact shape that failed
              // validation before the modelOutput() fixture was corrected to
              // emit one annotation per mark). A genuine validate.js failure,
              // not a stub-only shortcut.
              const broken = modelOutput(code, marks);
              broken.parts[0].markSchemeLines = [{ annotation: 'M1', text: 'Working shown.' }];
              return { content: [{ type: 'text', text: JSON.stringify(broken) }] };
            }
            return { content: [{ type: 'text', text: JSON.stringify(modelOutput(code, marks)) }] };
          },
        };
      },
    },
  };
}

const baseRequest = () => ({ course: 'AA', level: 'SL', paper: 'P2', targetMarks: 10 });

describe('paperBuilder — request validation', () => {
  it('rejects an invalid course/level/paper before any planning', () => {
    assert.throws(() => assertValidPaperRequest({ ...baseRequest(), course: 'XX' }), (e) => e.status === 400);
    assert.throws(() => assertValidPaperRequest({ ...baseRequest(), level: 'XL' }), (e) => e.status === 400);
    assert.throws(() => assertValidPaperRequest({ ...baseRequest(), paper: 'P3' }), (e) => e.status === 400); // P3 is HL-only
  });

  it('worksheet mode (default) requires a positive integer targetMarks', () => {
    assert.throws(() => assertValidPaperRequest({ course: 'AA', level: 'SL', paper: 'P2' }), (e) => /targetMarks/.test(e.message));
    assert.throws(() => assertValidPaperRequest({ ...baseRequest(), targetMarks: 0 }), (e) => e.status === 400);
    assert.throws(() => assertValidPaperRequest({ ...baseRequest(), targetMarks: -5 }), (e) => e.status === 400);
    assert.throws(() => assertValidPaperRequest({ ...baseRequest(), targetMarks: 1.5 }), (e) => e.status === 400);
  });

  it('examSimulation mode ignores any caller targetMarks and uses the REAL paper total (§2.5)', () => {
    const req = assertValidPaperRequest({ course: 'AA', level: 'SL', paper: 'P2', examSimulation: true, targetMarks: 999 });
    assert.equal(req.resolvedTargetMarks, 80); // real AA SL P2 total, not 999
  });

  it('examSimulation resolves the correct real total per paper type', () => {
    assert.equal(assertValidPaperRequest({ course: 'AA', level: 'HL', paper: 'P1', examSimulation: true }).resolvedTargetMarks, 110);
    assert.equal(assertValidPaperRequest({ course: 'AA', level: 'HL', paper: 'P3', examSimulation: true }).resolvedTargetMarks, 55);
  });

  it('an explicit subtopicCodes pool is validated the same way as single-question generation (§2.3)', () => {
    assert.throws(
      () => assertValidPaperRequest({ ...baseRequest(), subtopicCodes: ['AHL5.13'] }),
      (e) => e.status === 400 && /not available for AA SL/.test(e.message)
    );
  });

  // Regression: a numeric-STRING targetMarks (e.g. "50", exactly what a raw
  // <input type="number"> value or an un-coerced form field sends) was
  // rejected by the old strict `Number.isInteger` check, which only accepts
  // the actual `number` type — producing "targetMarks is required" even
  // though a valid value was supplied. See paperBuilder.js's coercion note.
  it('accepts targetMarks sent as a numeric string, not just a number', () => {
    const req = assertValidPaperRequest({ ...baseRequest(), targetMarks: '50' });
    assert.equal(req.resolvedTargetMarks, 50);
  });

  it('still rejects a non-numeric or empty targetMarks string', () => {
    assert.throws(() => assertValidPaperRequest({ ...baseRequest(), targetMarks: 'fifty' }), (e) => e.status === 400);
    assert.throws(() => assertValidPaperRequest({ ...baseRequest(), targetMarks: '' }), (e) => e.status === 400);
    assert.throws(() => assertValidPaperRequest({ ...baseRequest(), targetMarks: '0' }), (e) => e.status === 400);
  });

  // Regression: examSimulation as the STRING "false" is TRUTHY in JS
  // (`if ("false")` passes), which would silently take the exam-simulation
  // branch instead of the worksheet one and ignore a caller's real
  // targetMarks entirely.
  it('the string "false" for examSimulation is treated as false, not truthy', () => {
    const req = assertValidPaperRequest({ ...baseRequest(), examSimulation: 'false', targetMarks: 33 });
    assert.equal(req.examSimulation, false);
    assert.equal(req.resolvedTargetMarks, 33); // the caller's worksheet value, not a real-paper total
  });

  it('the string "true" for examSimulation is honoured', () => {
    const req = assertValidPaperRequest({ course: 'AA', level: 'SL', paper: 'P2', examSimulation: 'true' });
    assert.equal(req.examSimulation, true);
    assert.equal(req.resolvedTargetMarks, 80); // real AA SL P2 total
  });

  it('accepts a valid restricted pool', () => {
    const req = assertValidPaperRequest({ ...baseRequest(), subtopicCodes: ['SL5.9'] });
    assert.ok(req.pool.has('SL5.9'));
    assert.equal(req.pool.size, 1);
  });
});

describe('paperBuilder — planQuestionSizes', () => {
  it('sums to exactly the requested total', () => {
    for (const total of [8, 30, 80, 110, 55, 13]) {
      const sizes = planQuestionSizes(total, { min: 4, max: 20 });
      assert.equal(sizes.reduce((a, b) => a + b, 0), total, `total ${total}`);
    }
  });

  it('every planned question is within [min, max], except a lone question smaller than min', () => {
    const sizes = planQuestionSizes(80, { min: 4, max: 20 });
    for (const s of sizes) assert.ok(s >= 4 && s <= 20, `size ${s} out of bounds`);
  });

  it('a total below min produces exactly one question sized to that total', () => {
    assert.deepEqual(planQuestionSizes(3, { min: 4, max: 20 }), [3]);
  });

  it('never leaves a trailing question below min tacked on alone', () => {
    // 21 with bounds [4,20]: one question maxes at 20, remainder 1 < min(4) —
    // must not be emitted as its own sub-min question [1].
    const sizes = planQuestionSizes(21, { min: 4, max: 20 });
    assert.ok(sizes.every((s) => s >= 4), `sizes ${sizes} contain a sub-min trailing question`);
    assert.equal(sizes.reduce((a, b) => a + b, 0), 21);
  });
});

describe('paperBuilder — buildPaper generates questions concurrently, not sequentially', () => {
  // Real generateQuestion() calls are 30s-3min each (confirmed by live
  // testing) — running several in parallel is the actual speed fix. This
  // proves it's genuinely concurrent, not just correctly ordered: an instant
  // stub can't distinguish "ran in parallel" from "ran fast in sequence", so
  // this stub holds each call open for a fixed delay and tracks how many are
  // simultaneously in flight. Sequential execution could never observe more
  // than 1 concurrent call; this only passes if overlap actually happens.
  it('runs multiple questions in flight at once, not one-at-a-time', async () => {
    let concurrent = 0;
    let maxConcurrent = 0;
    const calls = [];
    const client = {
      calls,
      messages: {
        stream: (args) => {
          calls.push(args);
          return {
            finalMessage: async () => {
              concurrent += 1;
              maxConcurrent = Math.max(maxConcurrent, concurrent);
              await new Promise((r) => setTimeout(r, 25)); // hold the call open
              concurrent -= 1;
              const codeMatch = args.messages[0].content.match(/^\s*(\S+) \(/m);
              const marksMatch = args.messages[0].content.match(/approximately (\d+) marks/);
              return {
                content: [{
                  type: 'text',
                  text: JSON.stringify(modelOutput(codeMatch ? codeMatch[1] : 'SL5.9', marksMatch ? Number(marksMatch[1]) : 20)),
                }],
              };
            },
          };
        },
      },
    };

    // targetMarks:40 with the real P2 bounds (min 4, max 20) plans exactly 2
    // questions — both should start together under PAPER_CONCURRENCY=3.
    await buildPaper({ course: 'AA', level: 'SL', paper: 'P2', targetMarks: 40 }, { client });

    assert.ok(maxConcurrent > 1, `expected overlapping calls, but max concurrent was ${maxConcurrent} — questions ran sequentially`);
  });
});

describe('paperBuilder — buildPaper (stub client, no network)', () => {
  it('generates one validated question per planned slot, summing to the target', async () => {
    const client = stubClient();
    const { paper, warnings, meta } = await buildPaper(
      { course: 'AA', level: 'SL', paper: 'P2', targetMarks: 20, subtopicCodes: ['SL5.9', 'SL1.1'] },
      { client }
    );
    assert.equal(paper.totalMarks, 20);
    assert.equal(paper.questions.length, client.calls.length);
    // Every generated question always carries the originality manual-review
    // warning (see validate.js) — that's existing, correct, established
    // behaviour, not something a paper build should suppress. One per
    // question, each tagged with its questionNumber.
    assert.equal(warnings.length, paper.questions.length);
    assert.ok(warnings.every((w) => w.check === 'originality'));
    assert.deepEqual(warnings.map((w) => w.questionNumber), paper.questions.map((q) => q.number));
    assert.equal(meta.reviewRequired, true);
    // No Section A/B grouping anywhere in the returned shape.
    assert.equal('section' in paper, false);
    for (const q of paper.questions) assert.equal('section' in q, false);
  });

  it('every generated question draws only from the restricted pool (§2.3-style scoping honoured)', async () => {
    const client = stubClient();
    const { paper } = await buildPaper(
      { course: 'AA', level: 'SL', paper: 'P2', targetMarks: 30, subtopicCodes: ['SL5.9'] },
      { client }
    );
    for (const q of paper.questions) {
      assert.deepEqual(q.subtopicCodes, ['SL5.9']);
    }
  });

  it('questions are numbered sequentially, 1..N, with no gaps', async () => {
    const client = stubClient();
    const { paper } = await buildPaper({ course: 'AI', level: 'HL', paper: 'P2', targetMarks: 40 }, { client });
    assert.deepEqual(paper.questions.map((q) => q.number), paper.questions.map((_, i) => i + 1));
  });

  it('examSimulation:true builds a paper totalling the REAL exam total', async () => {
    const client = stubClient();
    const { paper } = await buildPaper({ course: 'AA', level: 'SL', paper: 'P1', examSimulation: true }, { client });
    assert.equal(paper.totalMarks, 80);
    assert.equal(paper.examSimulation, true);
  });

  it('if any one question fails validation on both attempts, the WHOLE paper build is aborted (no partial paper)', async () => {
    // planQuestionSizes(40, {min:4,max:20}) is deterministic: [20,20] — 2
    // questions. Question 1 succeeds first try (call index 0). Question 2's
    // BOTH attempts fail (call indices 1 and 2) — generate.js's built-in
    // retry-once is real and will otherwise mask a single failed attempt
    // (confirmed: that's exactly what happened before this fix), so both of
    // question 2's attempts must fail to actually exhaust it.
    const client = stubClient({ failOnCallIndices: new Set([1, 2]) });
    await assert.rejects(
      () => buildPaper({ course: 'AA', level: 'SL', paper: 'P2', targetMarks: 40 }, { client }),
      (e) => e.status === 502
    );
    // Confirms the failure happens mid-build (question 1 succeeded, question
    // 2 exhausted both attempts) rather than failing for an unrelated reason
    // — 3 calls made (1 success + 2 failed attempts), not fewer/more.
    assert.equal(client.calls.length, 3);
    // The failure happens after at least one successful question — confirm
    // no partial result was returned by checking the promise truly rejected
    // (assert.rejects already does this) rather than resolving with a short
    // `questions` array.
  });

  it('client disconnect (AbortSignal) stops the build without an orphaned extra call', async () => {
    const client = stubClient();
    const controller = new AbortController();
    controller.abort(); // abort before the first question even starts
    await assert.rejects(
      () => buildPaper({ course: 'AA', level: 'SL', paper: 'P2', targetMarks: 40 }, { client, signal: controller.signal }),
      (e) => e.aborted === true
    );
    assert.equal(client.calls.length, 0);
  });

  it('topic distribution across a full, unrestricted-pool paper stays within the taught topics for that course/level', async () => {
    const client = stubClient();
    const { paper } = await buildPaper({ course: 'AI', level: 'SL', paper: 'P1', targetMarks: 80 }, { client });
    for (const q of paper.questions) {
      for (const code of q.subtopicCodes) {
        assert.ok(findSubtopic('AI', code), `code ${code} not a real AI sub-topic`);
      }
    }
  });
});
