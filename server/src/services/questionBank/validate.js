// TODO(tests): the verification script for this module (every §10 item, both
// pass and fail paths) exists in the session scratchpad ONLY and is NOT
// committed. Promote it to a real test once a test runner is added.
//
// Rulebook §10 — validation checklist, run before returning any generated
// question or worksheet. Also carries the §2.3 hard guarantee.
//
// ---------------------------------------------------------------------------
// WHAT THIS MODULE DOES AND DOES NOT DO
//
// Findings are separated into two kinds, and the distinction is deliberate:
//
//   errors   — mechanically determined, unambiguous. The caller MUST reject
//              the generation and retry (or hard-error). Never "probably".
//   warnings — either heuristics derived from a definition, or items that are
//              genuinely semantic and cannot be verified by code. These are
//              FLAGGED FOR HUMAN REVIEW. They never block.
//
// Several §10 items are semantic (incline of difficulty, "used in the correct
// sense", originality). Reporting those as machine-verified would be a lie, and
// would recreate the exact failure this checklist exists to prevent — a
// constraint that looks enforced but is not. They are warnings, and the report
// says plainly that they were not verified.
//
// STRUCTURED FIELDS OVER TEXT SCANNING. Every blocking check reads a declared,
// structured field. Text pattern-matching is used ONLY for advisory warnings,
// never to block, because a regex over prose is precisely the "looks enforced
// but isn't" failure mode described above.
// ---------------------------------------------------------------------------

import { findSubtopic, codeExistsInCourse, isAHLCode } from './taxonomy.js';
import {
  isValidAnnotation, annotationMarkTotal, parseSubPartMarks, parseTotalLine,
  methodLabelStyle,
} from './markScheme.js';
import { findPaperType, allowsCalculator } from './paperTypes.js';
import { findCommandTerm, isKnownTerm } from './commandTerms.js';

/**
 * @typedef {Object} MarkSchemeLine
 * @property {string} annotation  e.g. 'M1', 'A1A1', '(M1)', 'AG'
 * @property {string} text
 *
 * @typedef {Object} AlternativeMethod                     §5.5
 * @property {string} label       'METHOD 1'|'METHOD 2'|… or 'EITHER'|'OR'
 * @property {MarkSchemeLine[]} lines
 *
 * @typedef {Object} QuestionPart
 * @property {string} label            e.g. '(a)', '(b)(i)'
 * @property {string} commandTerm
 * @property {number} marks
 * @property {string} prompt
 * @property {MarkSchemeLine[]}   [markSchemeLines]    single-route mark scheme
 * @property {AlternativeMethod[]} [alternativeMethods] §5.5, when a genuine
 *           alternative approach exists. Mutually exclusive with markSchemeLines.
 * @property {string} allocationLine   §2.4, e.g. '[M1 for setup, A1 for answer — 2 marks]'
 *
 * @typedef {Object} GeneratedQuestion
 * @property {'AA'|'AI'} course
 * @property {'SL'|'HL'} level
 * @property {'P1'|'P2'|'P3'} paper
 * @property {boolean} calculatorAllowed   §5.7 — DERIVED from course+paper and
 *           declared explicitly. Validated against paperTypes, never inferred
 *           from question wording.
 * @property {'early'|'mid'|'late'} difficultyPosition   §7 — the question's
 *           position on the paper's incline of difficulty. Must be declared;
 *           never inferred from mark distribution.
 * @property {string[]} subtopicCodes  §8 codes, interpreted within `course`
 * @property {number} totalMarks
 * @property {string} totalLine        §2.4, e.g. 'Total: [7 marks]'
 * @property {QuestionPart[]} parts
 */

/** §7 — permitted values for difficultyPosition. */
export const DIFFICULTY_POSITIONS = ['early', 'mid', 'late'];

const SEVERITY = { ERROR: 'error', WARNING: 'warning' };

function finding(check, severity, message, detail) {
  return detail === undefined ? { check, severity, message } : { check, severity, message, detail };
}

/** Collects findings and reports whether any are blocking. */
class Report {
  constructor() {
    this.findings = [];
  }
  error(check, message, detail) {
    this.findings.push(finding(check, SEVERITY.ERROR, message, detail));
  }
  warn(check, message, detail) {
    this.findings.push(finding(check, SEVERITY.WARNING, message, detail));
  }
  get errors() {
    return this.findings.filter((f) => f.severity === SEVERITY.ERROR);
  }
  get warnings() {
    return this.findings.filter((f) => f.severity === SEVERITY.WARNING);
  }
  get ok() {
    return this.errors.length === 0;
  }
  result() {
    return { ok: this.ok, errors: this.errors, warnings: this.warnings, findings: this.findings };
  }
}

// Advisory only (never blocking): does the prose lean on a calculator?
const GDC_PHRASING_RE = /\bGDC\b|graphic(?:s|al)? display calculator|\bcalculator\b/i;

// Negated mentions ("No calculator is permitted", "non-calculator") must be
// stripped first, or a correct non-calculator question trips its own advisory.
const CALC_NEGATED_RE = new RegExp(
  [
    '\\b(?:(?:no|not|without)\\s+(?:a\\s+|the\\s+)?|non[-\\s]?)(?:GDC|graphic(?:s|al)?\\s+display\\s+calculator|calculator)\\b',
    '\\b(?:GDC|calculator)\\b[^.]{0,40}?\\b(?:not|never)\\s+(?:permitted|allowed|available|required|used)\\b',
  ].join('|'),
  'gi'
);

/** True when prose relies on a calculator, ignoring negated mentions. */
function referencesCalculatorUse(text) {
  return GDC_PHRASING_RE.test(String(text).replace(CALC_NEGATED_RE, ' '));
}

// Detects a stated numeric-accuracy convention (§10 item 10).
const ACCURACY_RE = /\b\d+\s*s\.?\s*f\.?\b|significant figures?|decimal places?|\bexact(?:ly)? (?:value|form|answer)\b|\bin exact form\b/i;

/** All mark-scheme lines for a part, across single-route or alternative routes. */
function allMarkSchemeLines(part) {
  if (Array.isArray(part.alternativeMethods)) {
    return part.alternativeMethods.flatMap((m) => (Array.isArray(m.lines) ? m.lines : []));
  }
  return Array.isArray(part.markSchemeLines) ? part.markSchemeLines : [];
}

/**
 * Validate one generated question against §10.
 *
 * @param {GeneratedQuestion} question
 * @param {{ examSimulation?: boolean }} [options]
 * @returns {{ ok: boolean, errors: object[], warnings: object[], findings: object[] }}
 */
export function validateQuestion(question, options = {}) {
  const report = new Report();

  if (!question || typeof question !== 'object') {
    report.error('shape', 'Question is missing or not an object.');
    return report.result();
  }

  const {
    course, level, paper, subtopicCodes, parts, totalMarks, totalLine,
    calculatorAllowed, difficultyPosition,
  } = question;

  // --- shape gates: everything below depends on these -------------------
  if (course !== 'AA' && course !== 'AI') {
    report.error('shape', `course must be 'AA' or 'AI' (got ${JSON.stringify(course)}).`);
  }
  if (level !== 'SL' && level !== 'HL') {
    report.error('shape', `level must be 'SL' or 'HL' (got ${JSON.stringify(level)}).`);
  }
  if (!Array.isArray(parts) || parts.length === 0) {
    report.error('shape', 'Question must have at least one part.');
  }
  if (!report.ok) return report.result();

  const paperType = findPaperType(course, level, paper);
  if (!paperType) {
    report.error(
      'paper-availability',
      `${paper} is not an examinable paper for ${course} ${level}. (Paper 3 is HL-only.)`
    );
  }

  // --- §7: difficultyPosition must be DECLARED, not inferred -------------
  if (!DIFFICULTY_POSITIONS.includes(difficultyPosition)) {
    report.error(
      'difficulty-position',
      `difficultyPosition must be declared as one of ${DIFFICULTY_POSITIONS.join(' | ')} (got ${JSON.stringify(difficultyPosition)}).`
    );
  }

  // --- §10 item 9 + item 1 + item 2: taxonomy tags, AHL leak, course mix --
  if (!Array.isArray(subtopicCodes) || subtopicCodes.length === 0) {
    report.error('taxonomy-tags', 'Question must carry at least one §8 sub-topic code.');
  } else {
    for (const code of subtopicCodes) {
      // item 2 — the code must exist in THIS course. Codes are course-scoped;
      // e.g. AHL5.9 exists in AI but not in AA at all.
      if (!codeExistsInCourse(course, code)) {
        report.error(
          'course-exclusivity',
          `Sub-topic code ${code} does not exist in ${course}.`,
          { code, course }
        );
        continue;
      }
      // item 1 — the §2.3 hard gate. An SL question may never carry AHL content.
      if (level === 'SL' && isAHLCode(code)) {
        const entry = findSubtopic(course, code);
        report.error(
          'ahl-in-sl',
          `AHL content (${code}) in an SL-labelled question: "${entry?.description ?? ''}".`,
          { code, course, level }
        );
      }
    }
  }

  // --- §10 item 3 / §5.7: calculator, checked STRUCTURALLY ---------------
  // The blocking check compares the declared field against paperTypes. Prose is
  // only ever an advisory cross-check below.
  if (paperType) {
    const expected = allowsCalculator(course, level, paper);
    if (typeof calculatorAllowed !== 'boolean') {
      report.error(
        'calculator-assumption',
        `calculatorAllowed must be declared as a boolean (got ${JSON.stringify(calculatorAllowed)}). Expected ${expected} for ${course} ${level} ${paper}.`
      );
    } else if (calculatorAllowed !== expected) {
      report.error(
        'calculator-assumption',
        `calculatorAllowed is ${calculatorAllowed} but ${course} ${level} ${paper} requires ${expected}.`
      );
    }

    // Advisory only — prose that leans on a GDC where none is allowed. Cannot
    // block: a regex over prose is not a reliable gate.
    if (expected === false) {
      for (const part of parts) {
        const text = [
          part.prompt ?? '',
          part.allocationLine ?? '',
          ...allMarkSchemeLines(part).map((l) => l.text ?? ''),
        ].join(' ');
        if (referencesCalculatorUse(text)) {
          report.warn(
            'calculator-wording',
            `Part ${part.label}: wording appears to rely on a calculator on a non-calculator paper. Advisory text scan — review.`,
            { label: part.label }
          );
        }
      }
    }
  }

  // --- per-part checks ---------------------------------------------------
  let summedPartMarks = 0;

  for (const part of parts) {
    const where = `Part ${part.label ?? '(unlabelled)'}`;

    if (!Number.isInteger(part.marks) || part.marks <= 0) {
      report.error('mark-format', `${where}: marks must be a positive integer (got ${part.marks}).`);
    } else {
      summedPartMarks += part.marks;
    }

    // --- §10 item 5: [N marks] allocation line, consistent with part marks
    const declared = parseSubPartMarks(part.allocationLine);
    if (declared === null) {
      report.error(
        'mark-format',
        `${where}: missing or malformed §2.4 allocation line (expected e.g. "[M1 for setup, A1 for answer — 2 marks]").`,
        { allocationLine: part.allocationLine }
      );
    } else if (Number.isInteger(part.marks) && declared !== part.marks) {
      report.error(
        'mark-format',
        `${where}: allocation line declares ${declared} marks but the part is worth ${part.marks}.`
      );
    }

    // --- §10 item 6 + §5.5: mark scheme, single route or alternatives ----
    validateMarkScheme(part, report, where);

    // --- §10 item 4: command terms ---------------------------------------
    validateCommandTerm(part, { course, level }, report, where);
  }

  // --- §10 item 5 (cont.): totals ----------------------------------------
  if (Number.isInteger(totalMarks)) {
    if (summedPartMarks !== totalMarks) {
      report.error(
        'mark-format',
        `Part marks sum to ${summedPartMarks} but totalMarks is ${totalMarks}.`
      );
    }
    if (paperType && totalMarks > paperType.marks) {
      report.error(
        'mark-budget',
        `Question is worth ${totalMarks} marks, exceeding the whole ${course} ${level} ${paper} paper budget of ${paperType.marks}.`
      );
    }
  } else {
    report.error('mark-format', `totalMarks must be an integer (got ${totalMarks}).`);
  }

  const declaredTotal = parseTotalLine(totalLine);
  if (declaredTotal === null) {
    report.error('mark-format', 'Missing or malformed closing line (expected "Total: [N marks]").', {
      totalLine,
    });
  } else if (Number.isInteger(totalMarks) && declaredTotal !== totalMarks) {
    report.error('mark-format', `Total line declares ${declaredTotal} marks but totalMarks is ${totalMarks}.`);
  }

  // --- §10 item 7: incline of difficulty (SEMANTIC — never verified) ------
  // difficultyPosition is now declared (§7), but whether the CONTENT actually
  // matches that position, and whether sub-parts genuinely incline, remain
  // semantic judgements. Say so rather than implying verification.
  if (paper === 'P3' && parts.length > 1) {
    report.warn(
      'incline-of-difficulty',
      `Declared difficultyPosition="${difficultyPosition}". Whether the content matches that position, and whether sub-parts genuinely incline, were NOT verified. Human review required.`,
      { marks: parts.map((p) => p.marks) }
    );
  }

  // --- §10 item 10: numeric accuracy convention (heuristic) ---------------
  const allText = parts
    .map((p) => [p.prompt ?? '', ...allMarkSchemeLines(p).map((l) => l.text ?? '')].join(' '))
    .join(' ');
  if (!ACCURACY_RE.test(allText)) {
    report.warn(
      'accuracy-convention',
      'No numeric accuracy convention (exact / significant figures / decimal places) is stated or clearly implied.'
    );
  }

  // --- §10 item 8 / Step 3: originality (NOT AUTOMATED) -------------------
  report.warn(
    'originality',
    'Originality is NOT automatically checked. Manual spot-check required: confirm no question, numeric values, or scenario framing reproduces a real IB item.'
  );

  return report.result();
}

/**
 * §10 item 6 (annotations) and §5.5 (alternative methods).
 * A part carries EITHER a single markSchemeLines route OR two-or-more labelled
 * alternativeMethods — never both, never neither. Each alternative route must
 * independently award the part's full marks, since they are alternative paths
 * to the same credit.
 */
function validateMarkScheme(part, report, where) {
  const hasSingle = Array.isArray(part.markSchemeLines) && part.markSchemeLines.length > 0;
  const hasAlts = Array.isArray(part.alternativeMethods) && part.alternativeMethods.length > 0;

  if (hasSingle && hasAlts) {
    report.error(
      'mark-scheme',
      `${where}: has both markSchemeLines and alternativeMethods — use one or the other.`
    );
    return;
  }
  if (!hasSingle && !hasAlts) {
    report.error('mark-scheme', `${where}: no mark-scheme lines.`);
    return;
  }

  const checkRoute = (lines, routeLabel) => {
    let total = 0;
    for (const line of lines) {
      if (!isValidAnnotation(line.annotation)) {
        report.error(
          'mark-scheme',
          `${where}${routeLabel}: invalid annotation "${line.annotation}" (expected M/A/R with a digit, or AG).`,
          { annotation: line.annotation }
        );
        continue;
      }
      total += annotationMarkTotal(line.annotation);
    }
    if (Number.isInteger(part.marks) && total !== part.marks) {
      report.error(
        'mark-scheme',
        `${where}${routeLabel}: annotations award ${total} marks but the part is worth ${part.marks}.`
      );
    }
  };

  if (hasSingle) {
    checkRoute(part.markSchemeLines, '');
    return;
  }

  // --- §5.5 alternative methods ---
  const methods = part.alternativeMethods;
  if (methods.length < 2) {
    report.error(
      'alternative-methods',
      `${where}: alternativeMethods needs at least two routes (got ${methods.length}).`
    );
  }
  const labels = methods.map((m) => m.label);
  const style = methodLabelStyle(labels);
  if (style === null) {
    report.error(
      'alternative-methods',
      `${where}: invalid or inconsistent §5.5 labels [${labels.join(', ')}]. Use METHOD 1/METHOD 2/… or EITHER/OR, not a mixture.`,
      { labels }
    );
  }
  methods.forEach((m) => {
    const lines = Array.isArray(m.lines) ? m.lines : [];
    if (lines.length === 0) {
      report.error('alternative-methods', `${where} [${m.label}]: route has no mark-scheme lines.`);
      return;
    }
    checkRoute(lines, ` [${m.label}]`);
  });
}

/**
 * §10 item 4. We hold definitions for only part of the command-term glossary,
 * so: known terms get their few mechanically checkable expectations applied as
 * WARNINGS; unknown terms are flagged for review and never fail validation.
 */
function validateCommandTerm(part, ctx, report, where) {
  const raw = part.commandTerm;
  if (!raw || typeof raw !== 'string') {
    report.warn('command-term', `${where}: no command term recorded.`);
    return;
  }
  if (!isKnownTerm(raw)) {
    report.warn(
      'command-term',
      `${where}: "${raw}" is outside the defined command-term subset — usage NOT verified. Flagged for manual review.`,
      { term: raw }
    );
    return;
  }

  const term = findCommandTerm(raw);
  const expects = term.expects ?? {};
  const annotations = allMarkSchemeLines(part).map((l) => l.annotation ?? '').join(' ');
  const hasAlternatives = Array.isArray(part.alternativeMethods) && part.alternativeMethods.length > 1;

  if (expects.requiresAG && !/\bAG\b/.test(annotations)) {
    report.warn(
      'command-term',
      `${where}: "${term.term}" gives the result, so the mark scheme would normally carry AG. Heuristic — review.`
    );
  }
  if (expects.minimalWorking && /\bM\d/.test(annotations)) {
    report.warn(
      'command-term',
      `${where}: "${term.term}" implies little or no working, but the mark scheme awards a method mark. Heuristic — review.`
    );
  }
  // These two now read the STRUCTURED §5.5 field rather than scanning prose.
  if (expects.methodLocked && hasAlternatives) {
    report.warn(
      'command-term',
      `${where}: "${term.term}" is method-locked, but the mark scheme offers alternative methods. Heuristic — review.`
    );
  }
  if (expects.allowsAlternatives && !hasAlternatives) {
    report.warn(
      'command-term',
      `${where}: "${term.term}" credits other valid methods, but no §5.5 alternative-method route is present. Heuristic — review.`
    );
  }
  if (expects.levelBias && expects.levelBias !== ctx.level) {
    report.warn(
      'command-term',
      `${where}: "${term.term}" is normally a ${expects.levelBias} term but this is ${ctx.level}. Heuristic — review.`
    );
  }
  if (expects.courseBias && expects.courseBias !== ctx.course) {
    report.warn(
      'command-term',
      `${where}: "${term.term}" is normally a ${expects.courseBias} term but this is ${ctx.course}. Heuristic — review.`
    );
  }
}

/**
 * Validate an assembled worksheet/paper.
 *
 * §2.5 — worksheet-first. In the default (worksheet) mode there is NO target
 * length and no "X marks short" concept; a worksheet of any size is valid.
 * The paper mark budget is only asserted when examSimulation is explicitly on.
 *
 * @param {GeneratedQuestion[]} questions
 * @param {{ examSimulation?: boolean, course?: string, level?: string, paper?: string }} [options]
 */
export function validatePaper(questions, options = {}) {
  const report = new Report();
  const { examSimulation = false, course, level, paper } = options;

  if (!Array.isArray(questions) || questions.length === 0) {
    report.error('shape', 'A paper must contain at least one question.');
    return report.result();
  }

  const perQuestion = questions.map((q) => validateQuestion(q, options));
  perQuestion.forEach((r, i) => {
    for (const f of r.findings) {
      report.findings.push({ ...f, question: i + 1 });
    }
  });

  const total = questions.reduce((sum, q) => sum + (Number.isInteger(q.totalMarks) ? q.totalMarks : 0), 0);

  if (examSimulation) {
    const paperType = findPaperType(course, level, paper);
    if (!paperType) {
      report.error('mark-budget', `Exam simulation requested for a non-examinable paper: ${course} ${level} ${paper}.`);
    } else if (total !== paperType.marks) {
      report.error(
        'mark-budget',
        `Exam simulation for ${course} ${level} ${paper} requires exactly ${paperType.marks} marks; this paper totals ${total}.`
      );
    }
  }
  // Worksheet mode: no target, no shortfall messaging. Intentionally silent.

  return { ...report.result(), totalMarks: total, examSimulation };
}

/** Human-readable summary of a validation result, for logs and review UIs. */
export function summarize(result) {
  const e = result.errors.length;
  const w = result.warnings.length;
  return `${result.ok ? 'PASS' : 'FAIL'} — ${e} error${e === 1 ? '' : 's'}, ${w} warning${w === 1 ? '' : 's'} (warnings are unverified/manual-review items).`;
}
