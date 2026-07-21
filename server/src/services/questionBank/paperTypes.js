// TODO(tests): the verification script for this module (budgets, calculator
// policy, availability rules) exists in the session scratchpad ONLY and is NOT
// committed. Promote it to a real test once a test runner is added.
//
// Paper structure: mark budget, duration and calculator policy per
// course / level / paper. Feeds:
//   * §10 item 3 — calculator assumption must match the paper type
//   * §10 item 5 — mark allocation consistent with the paper-type mark budget
//   * §2.5      — the OPTIONAL "Simulate a full exam paper" target
//
// §2.5 IS IMPORTANT AND EASY TO GET BACKWARDS: worksheet-first is the DEFAULT.
// A teacher builds a worksheet of any length, any topic mix, any number of
// questions. The 80/110/55 budgets below apply ONLY when the caller explicitly
// turns exam simulation on. Never emit "X marks short of the real total"
// messaging in worksheet mode — see EXAM_SIMULATION_DEFAULT.

/** Calculator policy values. */
export const CALCULATOR = {
  NONE: 'none', // no calculator permitted (AA Paper 1)
  GDC: 'gdc',   // graphic display calculator required
};

/**
 * One row per examinable paper.
 *   marks    total marks available on the real paper
 *   minutes  scheduled duration
 *   calculator  CALCULATOR.NONE | CALCULATOR.GDC
 *
 * Calculator rule (§10 item 3): AA Paper 1 is the non-calculator paper at BOTH
 * levels; every other paper in both courses assumes a GDC.
 */
export const PAPER_TYPES = [
  // --- AA ---
  { course: 'AA', level: 'SL', paper: 'P1', marks: 80, minutes: 90, calculator: CALCULATOR.NONE },
  { course: 'AA', level: 'SL', paper: 'P2', marks: 80, minutes: 90, calculator: CALCULATOR.GDC },
  { course: 'AA', level: 'HL', paper: 'P1', marks: 110, minutes: 120, calculator: CALCULATOR.NONE },
  { course: 'AA', level: 'HL', paper: 'P2', marks: 110, minutes: 120, calculator: CALCULATOR.GDC },
  { course: 'AA', level: 'HL', paper: 'P3', marks: 55, minutes: 60, calculator: CALCULATOR.GDC },
  // --- AI ---
  { course: 'AI', level: 'SL', paper: 'P1', marks: 80, minutes: 90, calculator: CALCULATOR.GDC },
  { course: 'AI', level: 'SL', paper: 'P2', marks: 80, minutes: 90, calculator: CALCULATOR.GDC },
  { course: 'AI', level: 'HL', paper: 'P1', marks: 110, minutes: 120, calculator: CALCULATOR.GDC },
  { course: 'AI', level: 'HL', paper: 'P2', marks: 110, minutes: 120, calculator: CALCULATOR.GDC },
  { course: 'AI', level: 'HL', paper: 'P3', marks: 55, minutes: 60, calculator: CALCULATOR.GDC },
];

/**
 * §2.5 — worksheet-first. Exam simulation is OPT-IN, never the default framing.
 * Callers must pass an explicit flag to get exam-paper targets/messaging.
 */
export const EXAM_SIMULATION_DEFAULT = false;

/** Papers offered at a level. P3 exists only at HL, in both courses. */
export function papersFor(course, level) {
  return PAPER_TYPES.filter((p) => p.course === course && p.level === level);
}

/** Look up one paper type, or undefined if that combination isn't examinable. */
export function findPaperType(course, level, paper) {
  return PAPER_TYPES.find(
    (p) => p.course === course && p.level === level && p.paper === paper
  );
}

/** Is this paper examinable for this course/level? (P3 is HL-only.) */
export function isPaperAvailable(course, level, paper) {
  return Boolean(findPaperType(course, level, paper));
}

/**
 * Calculator policy for a paper. Throws 400 for a non-examinable combination
 * rather than silently defaulting — a wrong calculator assumption is a §10
 * hard-fail, so guessing here would defeat the check.
 */
export function calculatorPolicy(course, level, paper) {
  const p = findPaperType(course, level, paper);
  if (!p) {
    const err = new Error(`No such paper: ${course} ${level} ${paper}`);
    err.status = 400;
    err.expose = true;
    throw err;
  }
  return p.calculator;
}

/** True when a GDC is assumed available on this paper. */
export function allowsCalculator(course, level, paper) {
  return calculatorPolicy(course, level, paper) === CALCULATOR.GDC;
}

/**
 * Full-paper mark budget — ONLY meaningful in exam-simulation mode (§2.5).
 * Returns null when exam simulation is off, so callers cannot accidentally
 * render "X marks short" messaging for a worksheet.
 */
export function examSimulationTarget(course, level, paper, { examSimulation = EXAM_SIMULATION_DEFAULT } = {}) {
  if (!examSimulation) return null;
  const p = findPaperType(course, level, paper);
  if (!p) {
    const err = new Error(`No such paper: ${course} ${level} ${paper}`);
    err.status = 400;
    err.expose = true;
    throw err;
  }
  return { marks: p.marks, minutes: p.minutes };
}

/** Human-readable calculator note for question headers (never a user toggle). */
export function calculatorNote(course, level, paper) {
  return calculatorPolicy(course, level, paper) === CALCULATOR.NONE
    ? `No calculator — matches ${course} ${level} ${paper} conventions.`
    : `Graphic display calculator required — matches ${course} ${level} ${paper} conventions.`;
}

// --- Integrity check (runs at import) -------------------------------------
{
  const seen = new Set();
  for (const p of PAPER_TYPES) {
    const key = `${p.course}:${p.level}:${p.paper}`;
    if (seen.has(key)) throw new Error(`paperTypes: duplicate ${key}`);
    seen.add(key);
    if (!Number.isInteger(p.marks) || p.marks <= 0) throw new Error(`paperTypes: bad marks on ${key}`);
    if (!Number.isInteger(p.minutes) || p.minutes <= 0) throw new Error(`paperTypes: bad minutes on ${key}`);
    if (p.calculator !== CALCULATOR.NONE && p.calculator !== CALCULATOR.GDC) {
      throw new Error(`paperTypes: bad calculator policy on ${key}`);
    }
    // Confirmed budgets: SL 80/90, HL P1-P2 110/120, HL P3 55/60.
    const expected =
      p.level === 'SL' ? { marks: 80, minutes: 90 }
      : p.paper === 'P3' ? { marks: 55, minutes: 60 }
      : { marks: 110, minutes: 120 };
    if (p.marks !== expected.marks || p.minutes !== expected.minutes) {
      throw new Error(`paperTypes: ${key} budget ${p.marks}/${p.minutes} != ${expected.marks}/${expected.minutes}`);
    }
  }
  // P3 must be HL-only, and only AA P1 may be non-calculator.
  if (PAPER_TYPES.some((p) => p.paper === 'P3' && p.level !== 'HL')) {
    throw new Error('paperTypes: P3 must be HL-only');
  }
  const nonCalc = PAPER_TYPES.filter((p) => p.calculator === CALCULATOR.NONE);
  if (!nonCalc.every((p) => p.course === 'AA' && p.paper === 'P1')) {
    throw new Error('paperTypes: only AA Paper 1 may be non-calculator');
  }
  if (nonCalc.length !== 2) {
    throw new Error('paperTypes: expected exactly two non-calculator papers (AA SL P1, AA HL P1)');
  }
}
