// Tests: server/test/questionBank/weighting.test.js  (run: npm test, from server/)
//
// Rulebook §2.1 — topic weighting derived from prescribed teaching hours.
//
// §2.1 rule: when generating a "mixed topic" paper without specified weighting,
// default topic sampling probability to these hour ratios (normalized), NOT an
// equal split. (A flat 20%-per-topic split is wrong and was a real earlier bug.)
//
// ONLY the raw teaching hours are stored here. Every percentage/weight is
// DERIVED at call time, so this file can be diffed line-for-line against the
// rulebook table without doing any arithmetic in your head:
//
//   Topic                     AA SL   AA HL   AI SL   AI HL
//   Number & Algebra            19      39      16      29
//   Functions                   21      32      31      42
//   Geometry & Trigonometry     25      51      18      46
//   Statistics & Probability    27      33      36      52
//   Calculus                    28      55      19      41
//   ----------------------------------------------------------
//   (totals)                   120     210     120     210
//
// Note on the HL columns: these are TOTAL hours for an HL student (SL content
// plus AHL content combined), not the AHL-only increment — which is why every
// SL column totals 120 and every HL column totals 210.

import { TOPICS } from './taxonomy.js';

/**
 * Prescribed teaching hours, keyed by course -> student level -> topic number.
 * Topic numbers match TOPICS[].number in taxonomy.js.
 */
export const TEACHING_HOURS = {
  AA: {
    SL: { 1: 19, 2: 21, 3: 25, 4: 27, 5: 28 },
    HL: { 1: 39, 2: 32, 3: 51, 4: 33, 5: 55 },
  },
  AI: {
    SL: { 1: 16, 2: 31, 3: 18, 4: 36, 5: 19 },
    HL: { 1: 29, 2: 42, 3: 46, 4: 52, 5: 41 },
  },
};

function hoursFor(course, studentLevel) {
  const hours = TEACHING_HOURS[course]?.[studentLevel];
  if (!hours) {
    const err = new Error(`No teaching-hour data for course=${course} level=${studentLevel}`);
    err.status = 400;
    err.expose = true;
    throw err;
  }
  return hours;
}

/** Total prescribed hours across all five topics (120 at SL, 210 at HL). */
export function totalHours(course, studentLevel) {
  return Object.values(hoursFor(course, studentLevel)).reduce((a, b) => a + b, 0);
}

/**
 * Normalized topic weights, derived from hours. Returns one row per topic:
 *   { topic, name, hours, weight, percent }
 * `weight` sums to 1 across topics; `percent` is weight*100 rounded to 1dp
 * (display only — always compute from `weight`, never from `percent`).
 */
export function topicWeights(course, studentLevel) {
  const hours = hoursFor(course, studentLevel);
  const total = totalHours(course, studentLevel);
  return TOPICS.map((t) => {
    const h = hours[t.number];
    const weight = h / total;
    return {
      topic: t.number,
      name: t.name,
      hours: h,
      weight,
      percent: Math.round(weight * 1000) / 10,
    };
  });
}

/**
 * Pick a topic at random with probability proportional to teaching hours.
 * This is the §2.1 default for "mixed topic" generation.
 * `rng` is injectable so callers/tests can make sampling deterministic.
 */
export function sampleTopic(course, studentLevel, rng = Math.random) {
  const rows = topicWeights(course, studentLevel);
  let r = rng();
  for (const row of rows) {
    r -= row.weight;
    if (r <= 0) return row.topic;
  }
  // Floating-point guard: fall through to the last topic.
  return rows[rows.length - 1].topic;
}

/**
 * Deterministically split `count` items across topics in proportion to hours,
 * using the largest-remainder (Hamilton) method so the parts always sum to
 * exactly `count`. Use this when assembling a worksheet/paper of known size;
 * use sampleTopic() when drawing questions one at a time.
 *
 * @returns Array<{ topic, name, count }>
 */
export function allocateByWeight(course, studentLevel, count) {
  if (!Number.isInteger(count) || count < 0) {
    const err = new Error('allocateByWeight: count must be a non-negative integer');
    err.status = 400;
    err.expose = true;
    throw err;
  }
  const rows = topicWeights(course, studentLevel);

  const exact = rows.map((row) => ({ ...row, raw: row.weight * count }));
  const allocated = exact.map((row) => ({ ...row, count: Math.floor(row.raw) }));

  let remaining = count - allocated.reduce((sum, row) => sum + row.count, 0);
  // Hand out the leftovers to the largest fractional remainders first.
  const byRemainder = [...allocated].sort(
    (a, b) => (b.raw - Math.floor(b.raw)) - (a.raw - Math.floor(a.raw))
  );
  for (let i = 0; remaining > 0; i = (i + 1) % byRemainder.length, remaining--) {
    byRemainder[i].count += 1;
  }

  return allocated.map(({ topic, name, count: n }) => ({ topic, name, count: n }));
}

// --- Integrity check (runs at import) -------------------------------------
// Catches a mistyped hour value or a missing topic before it can silently skew
// every generated paper.
{
  for (const course of Object.keys(TEACHING_HOURS)) {
    for (const level of Object.keys(TEACHING_HOURS[course])) {
      const hours = TEACHING_HOURS[course][level];
      for (const t of TOPICS) {
        const h = hours[t.number];
        if (!Number.isInteger(h) || h <= 0) {
          throw new Error(`weighting: bad hours for ${course} ${level} topic ${t.number}`);
        }
      }
      if (Object.keys(hours).length !== TOPICS.length) {
        throw new Error(`weighting: ${course} ${level} does not cover all ${TOPICS.length} topics`);
      }
      // Every IB maths course totals 120 taught hours at SL and 210 at HL.
      const expected = level === 'SL' ? 120 : 210;
      const actual = Object.values(hours).reduce((a, b) => a + b, 0);
      if (actual !== expected) {
        throw new Error(
          `weighting: ${course} ${level} hours total ${actual}, expected ${expected} — check against §2.1`
        );
      }
    }
  }
}
