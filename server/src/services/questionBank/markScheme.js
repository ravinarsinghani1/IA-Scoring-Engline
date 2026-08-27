// Tests: server/test/questionBank/markScheme.test.js  (run: npm test, from server/)
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

// --- §5.5 alternative-method labelling ------------------------------------
//
// Where a genuine alternative approach exists, the mark scheme labels each
// route. Two conventions are permitted, and a single part must not mix them:
//   numbered   METHOD 1 / METHOD 2 / METHOD 3 ...
//   either-or  EITHER / OR   (exactly two routes)
//
// NOTE: implemented from the labelling conventions supplied with the contract
// revision. The full §5.5 text was not available; if it constrains this
// further (e.g. when an alternative counts as "genuine"), revisit.

export const METHOD_LABEL_STYLES = {
  NUMBERED: 'numbered',
  EITHER_OR: 'either-or',
};

export const EITHER_OR_LABELS = ['EITHER', 'OR'];

const NUMBERED_LABEL_RE = /^METHOD\s+(\d+)$/i;

/**
 * Classify a set of alternative-method labels.
 * @returns {'numbered'|'either-or'|null} null when the labels are invalid,
 *          inconsistent, or mix the two conventions.
 */
export function methodLabelStyle(labels) {
  if (!Array.isArray(labels) || labels.length < 2) return null;
  const upper = labels.map((l) => String(l).trim().toUpperCase());

  if (upper.join('|') === EITHER_OR_LABELS.join('|')) return METHOD_LABEL_STYLES.EITHER_OR;

  const numbers = upper.map((l) => {
    const m = l.match(NUMBERED_LABEL_RE);
    return m ? Number(m[1]) : null;
  });
  if (numbers.every((n) => n !== null)) {
    // Must be sequential from 1: METHOD 1, METHOD 2, ...
    const sequential = numbers.every((n, i) => n === i + 1);
    return sequential ? METHOD_LABEL_STYLES.NUMBERED : null;
  }
  return null;
}

/** True when a label set is a valid, self-consistent §5.5 convention. */
export function isValidMethodLabelSet(labels) {
  return methodLabelStyle(labels) !== null;
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
  - CRITICAL — before writing the allocation line, ADD UP the marks from
    every annotation you just wrote for THIS sub-part (M1=1, A1=1, A2=2,
    R1=1, ...; AG=0). That sum MUST exactly equal this sub-part's declared
    mark value. If it does not match, do NOT change the mark value — go
    back and fix the annotations (add, remove, split, or combine mark
    codes) until they sum to exactly the right total. Do this check for
    EVERY sub-part, including the last one in a long question — drift is
    most common there, not in the earlier, shorter sub-parts.
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
