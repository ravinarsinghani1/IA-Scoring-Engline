// TODO(tests): the verification script for this module (term lookup, longest-
// match ordering, heuristic expectations) exists in the session scratchpad ONLY
// and is NOT committed. Promote it once a test runner is added.
//
// IB command terms — the subset the rulebook defines explicitly.
//
// COVERAGE IS PARTIAL AND DELIBERATELY SO. The subject-guide appendix carries a
// fuller (~30 term) glossary that has not been transcribed into the rulebook.
// We therefore validate usage ONLY for the terms below. Any other command term
// appearing in generated output must be FLAGGED FOR MANUAL REVIEW, never
// hard-failed against a definition we do not have. See isKnownTerm().
//
// Bookkeeping note: the rulebook lists 16 bullet entries, two of which pair two
// terms each ("Sketch vs Draw", "Comment / Interpret"). Those are stored as
// separate entries here because a validator must match one term at a time,
// giving 18 entries from 16 rulebook bullets. Sketch and Draw carry contrasting
// definitions; Comment and Interpret share one.

/**
 * @typedef {Object} CommandTerm
 * @property {string} term
 * @property {string} definition   verbatim sense from the rulebook
 * @property {object} [expects]    mechanically checkable expectations (heuristics only)
 */

/**
 * `expects` encodes the few parts of a definition a validator can actually
 * test. These produce WARNINGS, never hard failures — they are heuristics
 * derived from the definition, not semantic verification of usage.
 *   requiresAG      the result is given, so the mark scheme should contain AG
 *   minimalWorking  little/no working expected (so method marks are suspicious)
 *   methodLocked    preceding method only; alternative methods earn nothing
 *   allowsAlternatives  other valid methods are explicitly credited
 *   levelBias / courseBias  where the term is normally seen
 */
export const COMMAND_TERMS = [
  {
    term: 'Calculate',
    definition: 'Obtain a numerical answer showing relevant working stages.',
  },
  {
    term: 'Show that',
    definition:
      'Obtain the required (given) result without full formality of proof; generally non-calculator in spirit even on calculator papers.',
    expects: { requiresAG: true },
  },
  {
    term: 'Hence',
    definition:
      'Use the preceding work to obtain the result (method-locked, no follow-through or alternate-method credit).',
    expects: { methodLocked: true },
  },
  {
    term: 'Hence or otherwise',
    definition:
      'Preceding work is suggested, but other valid methods are also credited.',
    expects: { allowsAlternatives: true },
  },
  {
    term: 'Write down',
    definition: 'Little to no working required, often a direct GDC read-off.',
    expects: { minimalWorking: true },
  },
  {
    term: 'Find',
    definition:
      'Obtain an answer showing relevant working stages (the default general-purpose term).',
  },
  {
    term: 'Determine',
    definition: 'Obtain the only possible answer (implies uniqueness).',
  },
  {
    term: 'Justify',
    definition: 'Give valid reasons or evidence supporting a conclusion.',
  },
  {
    term: 'Deduce',
    definition: 'Reach a conclusion from given information (light reasoning chain).',
  },
  {
    term: 'Prove',
    definition:
      'Formal, rigorous logical derivation to the required result (HL, AA-biased).',
    expects: { levelBias: 'HL', courseBias: 'AA' },
  },
  {
    term: 'Sketch',
    definition: 'General shape and key features; no graph-paper precision required.',
  },
  {
    term: 'Draw',
    definition: 'Accurate, to-scale, plotted representation.',
  },
  {
    term: 'Comment',
    definition:
      'Contextual, real-world-grounded judgment rather than pure computation (AI-biased).',
    expects: { courseBias: 'AI' },
  },
  {
    term: 'Interpret',
    definition:
      'Contextual, real-world-grounded judgment rather than pure computation (AI-biased).',
    expects: { courseBias: 'AI' },
  },
  {
    term: 'State',
    definition: 'Brief answer; no working or explanation needed.',
    expects: { minimalWorking: true },
  },
  {
    term: 'Verify',
    definition:
      'Confirm a given result is consistent, without deriving it from scratch.',
  },
  {
    term: 'Estimate',
    definition: 'An approximate value is expected, not an exact one.',
  },
  {
    term: 'Suggest',
    definition:
      'Propose a plausible answer or hypothesis; open to reasonable variation.',
  },
];

/** Number of rulebook bullets these 18 entries came from (see header note). */
export const RULEBOOK_BULLET_COUNT = 16;

// Longest-first so "Hence or otherwise" is matched before "Hence".
const TERMS_BY_LENGTH = [...COMMAND_TERMS].sort((a, b) => b.term.length - a.term.length);

const BY_LOWER = new Map(COMMAND_TERMS.map((t) => [t.term.toLowerCase(), t]));

/** Exact (case-insensitive) lookup of a command term. */
export function findCommandTerm(term) {
  return typeof term === 'string' ? BY_LOWER.get(term.trim().toLowerCase()) : undefined;
}

/**
 * Is this a term we hold a definition for? A `false` here means "we cannot
 * verify usage", which must FLAG for manual review — not fail validation.
 */
export function isKnownTerm(term) {
  return Boolean(findCommandTerm(term));
}

/**
 * Identify the leading command term of a prompt string, longest match first.
 * Returns the CommandTerm or undefined when none of our known terms leads.
 */
export function detectLeadingTerm(prompt) {
  if (typeof prompt !== 'string') return undefined;
  const text = prompt.trim().toLowerCase();
  return TERMS_BY_LENGTH.find((t) => text.startsWith(t.term.toLowerCase()));
}

/** Guidance block for the generation prompt, derived from the data above. */
export function commandTermPromptGuidance() {
  const lines = COMMAND_TERMS.map((t) => `  ${t.term} — ${t.definition}`).join('\n');
  return `Use IB command terms in their defined sense. Defined terms:
${lines}

Prefer these terms. If a question genuinely needs a command term outside this
list, it will be flagged for human review rather than rejected.`;
}

// --- Integrity check (runs at import) -------------------------------------
{
  const seen = new Set();
  for (const t of COMMAND_TERMS) {
    const key = t.term.toLowerCase();
    if (seen.has(key)) throw new Error(`commandTerms: duplicate term ${t.term}`);
    seen.add(key);
    if (!t.definition || typeof t.definition !== 'string') {
      throw new Error(`commandTerms: missing definition for ${t.term}`);
    }
  }
  // "Hence or otherwise" must win over "Hence" during detection, or a
  // method-locked check would fire on a question that credits alternatives.
  const detected = detectLeadingTerm('Hence or otherwise, find the value of x.');
  if (detected?.term !== 'Hence or otherwise') {
    throw new Error(`commandTerms: longest-match ordering broken (got ${detected?.term})`);
  }
}
