// TODO(tests): the verification script for this module (annotation parsing,
// mark totals, §2.4 format patterns) exists in the session scratchpad ONLY and
// is NOT committed. Promote it to a real test once a test runner is added.
//
// Rulebook §5.1 / §5.2 — mark-scheme annotation codes and chaining rules,
// plus the §2.4 output format every generated mark scheme must follow.
//
// These are GENERIC IB marking conventions (shared methodology, not
// copyrightable). Nothing here reproduces wording from any real mark scheme.

/**
 * §5.1 — Annotation codes.
 * `awardsMarks` is false for AG because "answer given" earns nothing for
 * restating the result; the marks live in the working that precedes it.
 */
export const ANNOTATION_CODES = {
  M: {
    code: 'M',
    name: 'Method mark',
    awardsMarks: true,
    definition:
      'Correct approach, awarded even if execution is imperfect. M2 etc. denote multiple method marks.',
  },
  A: {
    code: 'A',
    name: 'Accuracy / answer mark',
    awardsMarks: true,
    definition:
      'Accuracy or answer mark, contingent on the preceding M mark(s). A2 etc. denote multiple accuracy marks.',
  },
  R: {
    code: 'R',
    name: 'Reasoning mark',
    awardsMarks: true,
    definition: 'Awarded for valid reasoning or justification.',
  },
  AG: {
    code: 'AG',
    name: 'Answer given',
    awardsMarks: false,
    definition:
      'The result is given in the question. No marks for restating it — the marks are for the working that reaches it.',
  },
};

/**
 * §5.2 — Chaining and independence rules. Held as data so the same wording
 * drives both the generation prompt and reviewer-facing documentation.
 */
export const CHAINING_RULES = [
  'M1A1 on one line = the method mark plus one accuracy mark for using that method correctly.',
  'Multiple A marks on one line (A1A1) may be awarded independently — e.g. a wrong first value followed by two correct ones scores A0A1A1.',
  'Unsplit M2 / A2 should not be broken into partial credit unless the scheme explicitly says so.',
  'Once a correct final answer is seen, ignore further correct working.',
  'Further working that reveals a misunderstanding costs the final A1.',
  'Exception: an isolated wrong decimal following a correct exact value still earns the A1 — ignore the stray error, UNLESS that wrong decimal carries into a later part.',
];

/** An implied mark, written in brackets, only credited if correct work is seen or clearly implied. */
export const IMPLIED_MARK_NOTE =
  '(M1) in brackets denotes an implied mark: award only if the correct work is seen or clearly implied.';

// --- Annotation parsing ---------------------------------------------------

// Matches one token: an optionally-bracketed M/A/R with a digit, or a bare AG.
const TOKEN_RE = /\((M|A|R)(\d+)\)|(M|A|R)(\d+)|(AG)/g;

/**
 * Parse an annotation string such as 'M1A1', 'A1A1', '(M1)A1' or 'AG'.
 * @returns Array<{ code: 'M'|'A'|'R'|'AG', marks: number, implied: boolean }>
 *          Returns [] when the string contains no recognisable token.
 */
export function parseAnnotation(annotation) {
  if (typeof annotation !== 'string') return [];
  const tokens = [];
  for (const m of annotation.matchAll(TOKEN_RE)) {
    if (m[5]) {
      tokens.push({ code: 'AG', marks: 0, implied: false });
    } else if (m[1]) {
      tokens.push({ code: m[1], marks: Number(m[2]), implied: true });
    } else {
      tokens.push({ code: m[3], marks: Number(m[4]), implied: false });
    }
  }
  return tokens;
}

/**
 * True when the whole string is annotation tokens and nothing else — used to
 * reject malformed codes (e.g. 'M' with no digit, or an invented 'B1').
 */
export function isValidAnnotation(annotation) {
  if (typeof annotation !== 'string' || annotation.trim() === '') return false;
  const tokens = parseAnnotation(annotation);
  if (tokens.length === 0) return false;
  const consumed = annotation.replace(TOKEN_RE, '').trim();
  return consumed === '';
}

/** Total marks an annotation string awards (AG contributes 0). */
export function annotationMarkTotal(annotation) {
  return parseAnnotation(annotation).reduce((sum, t) => sum + t.marks, 0);
}

// --- §2.4 output format ---------------------------------------------------
//
// Every sub-part ends with a bracketed allocation line, e.g.
//   [M1 for correct GDC setup, A1 for answer — 2 marks]
// and every question ends with a total line, e.g.
//   Total: [7 marks]

/** Matches the trailing "— N marks]" of a sub-part allocation line. */
export const SUBPART_ALLOCATION_RE = /\[(.+?)[—-]\s*(\d+)\s*marks?\]/;

/** Matches a question's closing total line. */
export const TOTAL_LINE_RE = /^Total:\s*\[(\d+)\s*marks?\]\s*$/m;

/** Render "[1 mark]" / "[N marks]" with correct pluralisation. */
export function formatMarkCount(n) {
  return `[${n} ${n === 1 ? 'mark' : 'marks'}]`;
}

/**
 * Build a §2.4 sub-part allocation line from its parts.
 * @param entries Array<{ annotation: string, reason: string }>
 * @example formatSubPartAllocation([
 *   { annotation: 'M1', reason: 'for correct GDC setup' },
 *   { annotation: 'A1', reason: 'for answer' },
 * ]) // '[M1 for correct GDC setup, A1 for answer — 2 marks]'
 */
export function formatSubPartAllocation(entries) {
  const body = entries.map((e) => `${e.annotation} ${e.reason}`.trim()).join(', ');
  const total = entries.reduce((sum, e) => sum + annotationMarkTotal(e.annotation), 0);
  return `[${body} — ${total} ${total === 1 ? 'mark' : 'marks'}]`;
}

/** Build the closing total line for a question. */
export function formatTotalLine(totalMarks) {
  return `Total: ${formatMarkCount(totalMarks)}`;
}

/** Extract the declared mark count from a sub-part allocation line, or null. */
export function parseSubPartMarks(line) {
  const m = typeof line === 'string' ? line.match(SUBPART_ALLOCATION_RE) : null;
  return m ? Number(m[2]) : null;
}

/** Extract the declared total from a question's Total line, or null. */
export function parseTotalLine(text) {
  const m = typeof text === 'string' ? text.match(TOTAL_LINE_RE) : null;
  return m ? Number(m[1]) : null;
}

/**
 * Guidance block injected into the generation prompt. Derived from the data
 * above so prompt and validator can never drift apart.
 */
export function markSchemePromptGuidance() {
  const codes = Object.values(ANNOTATION_CODES)
    .map((c) => `  ${c.code} — ${c.name}: ${c.definition}`)
    .join('\n');
  const rules = CHAINING_RULES.map((r) => `  - ${r}`).join('\n');
  return `Annotation codes:
${codes}
  ${IMPLIED_MARK_NOTE}

Chaining and independence rules:
${rules}

Required format for every sub-part:
  - State the GDC/method setup explicitly.
  - Show step-by-step working, not just the final value.
  - Annotate each line with M1/A1/R1 as appropriate.
  - End the sub-part with a bracketed allocation, e.g.
      [M1 for correct GDC setup, A1 for answer — 2 marks]
  - After the final sub-part, close the question with:
      Total: [N marks]`;
}

// --- Integrity check (runs at import) -------------------------------------
{
  // The formatters and parsers must round-trip, or validation would silently
  // disagree with generation.
  const line = formatSubPartAllocation([
    { annotation: 'M1', reason: 'for correct GDC setup' },
    { annotation: 'A1', reason: 'for answer' },
  ]);
  if (parseSubPartMarks(line) !== 2) {
    throw new Error(`markScheme: sub-part allocation does not round-trip (${line})`);
  }
  if (parseTotalLine(formatTotalLine(7)) !== 7) {
    throw new Error('markScheme: total line does not round-trip');
  }
  if (annotationMarkTotal('M1A1') !== 2 || annotationMarkTotal('AG') !== 0) {
    throw new Error('markScheme: annotation totals are wrong');
  }
  if (!isValidAnnotation('M1A1') || isValidAnnotation('B1')) {
    throw new Error('markScheme: annotation validity check is wrong');
  }
}
