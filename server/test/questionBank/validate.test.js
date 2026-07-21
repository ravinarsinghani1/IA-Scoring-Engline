// §10 validation checklist + command terms — ported from the pre-commit suite.

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
  COMMAND_TERMS, RULEBOOK_BULLET_COUNT, findCommandTerm, isKnownTerm, detectLeadingTerm,
  commandTermPromptGuidance,
} from '../../src/services/questionBank/commandTerms.js';
import {
  validateQuestion, validatePaper, summarize, DIFFICULTY_POSITIONS,
} from '../../src/services/questionBank/validate.js';

const hasError = (r, c) => r.errors.some((f) => f.check === c);
const hasWarn = (r, c) => r.warnings.some((f) => f.check === c);

/** A valid AA SL P2 question under the revised contract. */
const valid = () => ({
  course: 'AA', level: 'SL', paper: 'P2',
  calculatorAllowed: true,       // §5.7 — AA SL P2 permits a GDC
  difficultyPosition: 'mid',     // §7
  subtopicCodes: ['SL5.9'],      // AA kinematics
  totalMarks: 5,
  totalLine: 'Total: [5 marks]',
  parts: [
    {
      label: '(a)', commandTerm: 'Find', marks: 2,
      prompt: 'Find the velocity when t = 3, giving your answer to 3 s.f.',
      allocationLine: '[M1 for differentiating, A1 for answer — 2 marks]',
      markSchemeLines: [
        { annotation: 'M1', text: 'Differentiate s(t) to obtain v(t).' },
        { annotation: 'A1', text: 'v(3) = 12.4 (3 s.f.)' },
      ],
    },
    {
      label: '(b)', commandTerm: 'Determine', marks: 3,
      prompt: 'Determine the times at which the particle is at rest.',
      allocationLine: '[M1 for setting v = 0, A1A1 for both times — 3 marks]',
      markSchemeLines: [
        { annotation: 'M1', text: 'Set v(t) = 0.' },
        { annotation: 'A1A1', text: 't = 1 and t = 4' },
      ],
    },
  ],
});

/** Build a question whose first part uses §5.5 alternative methods. */
const withAlts = (labels) => {
  const q = valid();
  const p = q.parts[0];
  delete p.markSchemeLines;
  p.commandTerm = 'Hence or otherwise';
  p.alternativeMethods = labels.map((label) => ({
    label,
    lines: [
      { annotation: 'M1', text: `${label}: set up the approach.` },
      { annotation: 'A1', text: 'v(3) = 12.4 (3 s.f.)' },
    ],
  }));
  return q;
};

describe('command terms', () => {
  it('holds 18 entries drawn from 16 rulebook bullets', () => {
    assert.equal(COMMAND_TERMS.length, 18);
    assert.equal(RULEBOOK_BULLET_COUNT, 16);
  });

  it('Sketch and Draw carry different definitions', () => {
    assert.notEqual(findCommandTerm('Sketch').definition, findCommandTerm('Draw').definition);
  });

  it('Comment and Interpret share a definition', () => {
    assert.equal(findCommandTerm('Comment').definition, findCommandTerm('Interpret').definition);
  });

  it('lookup is case-insensitive', () => {
    assert.ok(findCommandTerm('hence OR OTHERWISE'));
  });

  it('"Hence or otherwise" wins over "Hence" (longest match)', () => {
    assert.equal(detectLeadingTerm('Hence or otherwise, find x.').term, 'Hence or otherwise');
    assert.equal(detectLeadingTerm('Hence, find x.').term, 'Hence');
  });

  it('an undefined term is not known', () => {
    assert.equal(isKnownTerm('Elucidate'), false);
  });

  it('prompt guidance is derived from the term data (generate.js depends on this)', () => {
    const g = commandTermPromptGuidance();
    for (const t of COMMAND_TERMS) {
      assert.ok(g.includes(t.term), `guidance omits "${t.term}"`);
      assert.ok(g.includes(t.definition), `guidance omits the definition of "${t.term}"`);
    }
    // It must also state the flag-don't-fail rule for terms outside the subset.
    assert.match(g, /flagged for human review rather than rejected/i);
  });
});

describe('baseline question', () => {
  it('passes with no errors', () => {
    const r = validateQuestion(valid());
    assert.ok(r.ok, JSON.stringify(r.errors));
  });

  it('raises originality as its only warning', () => {
    const r = validateQuestion(valid());
    assert.equal(r.warnings.length, 1);
    assert.ok(hasWarn(r, 'originality'));
  });

  it('summarize() labels warnings as unverified', () => {
    assert.match(summarize(validateQuestion(valid())), /PASS.*unverified/);
  });
});

describe('shape gates — malformed input is rejected before deeper checks', () => {
  it('a non-object question is an error', () => {
    for (const bad of [null, undefined, 'a question', 42]) {
      assert.ok(hasError(validateQuestion(bad), 'shape'), `accepted ${JSON.stringify(bad)}`);
    }
  });

  it('an invalid course is an error', () => {
    const q = valid(); q.course = 'XX';
    assert.ok(hasError(validateQuestion(q), 'shape'));
  });

  it('an invalid level is an error', () => {
    const q = valid(); q.level = 'XL';
    assert.ok(hasError(validateQuestion(q), 'shape'));
  });

  it('missing or empty parts is an error', () => {
    const missing = valid(); delete missing.parts;
    assert.ok(hasError(validateQuestion(missing), 'shape'));
    const empty = valid(); empty.parts = [];
    assert.ok(hasError(validateQuestion(empty), 'shape'));
  });

  it('a paper with no questions is an error', () => {
    assert.ok(hasError(validatePaper([]), 'shape'));
    assert.ok(hasError(validatePaper(null), 'shape'));
  });
});

describe('§10 item 9 — taxonomy tags are mandatory', () => {
  it('missing subtopicCodes is an error', () => {
    const q = valid(); delete q.subtopicCodes;
    assert.ok(hasError(validateQuestion(q), 'taxonomy-tags'));
  });

  it('an empty subtopicCodes array is an error', () => {
    const q = valid(); q.subtopicCodes = [];
    assert.ok(hasError(validateQuestion(q), 'taxonomy-tags'));
  });
});

describe('§5.7 — calculatorAllowed is structural, not text-scanned', () => {
  it('missing calculatorAllowed is an error', () => {
    const q = valid(); delete q.calculatorAllowed;
    assert.ok(hasError(validateQuestion(q), 'calculator-assumption'));
  });

  it('calculatorAllowed=false on a GDC paper is an error', () => {
    const q = valid(); q.calculatorAllowed = false;
    assert.ok(hasError(validateQuestion(q), 'calculator-assumption'));
  });

  it('AA P1 with calculatorAllowed=false passes', () => {
    const q = valid(); q.paper = 'P1'; q.calculatorAllowed = false;
    assert.ok(validateQuestion(q).ok, JSON.stringify(validateQuestion(q).errors));
  });

  it('AA P1 with calculatorAllowed=true is an error', () => {
    const q = valid(); q.paper = 'P1'; q.calculatorAllowed = true;
    assert.ok(hasError(validateQuestion(q), 'calculator-assumption'));
  });

  it('AI P1 with calculatorAllowed=true passes', () => {
    const q = valid();
    q.course = 'AI'; q.paper = 'P1'; q.calculatorAllowed = true;
    q.subtopicCodes = ['SL5.1'];   // AI has no SL5.9
    assert.ok(validateQuestion(q).ok, JSON.stringify(validateQuestion(q).errors));
  });

  it('an AA-only code is rejected when course=AI (regression guard)', () => {
    const q = valid(); q.course = 'AI'; q.subtopicCodes = ['SL5.9'];
    assert.ok(hasError(validateQuestion(q), 'course-exclusivity'));
  });

  it('GDC wording on a non-calculator paper warns but does NOT block', () => {
    const q = valid();
    q.paper = 'P1'; q.calculatorAllowed = false;
    q.parts[0].markSchemeLines[0].text = 'Use the GDC to find the root.';
    const r = validateQuestion(q);
    assert.ok(hasWarn(r, 'calculator-wording'));
    assert.ok(r.ok);
  });

  // All four phrasings exercise DIFFERENT branches of CALC_NEGATED_RE:
  //   "no <noun>"        prefix negation
  //   "without a <noun>" prefix negation, article form
  //   "non-<noun>"       hyphenated form (no whitespace after the negator)
  //   "<noun> ... not permitted"  postfix negation — a separate alternative
  const NEGATED_PHRASES = [
    'No calculator is permitted.',
    'Answer without a calculator.',
    'This is a non-calculator question.',
    'A GDC is not permitted for this part.',
  ];
  for (const phrase of NEGATED_PHRASES) {
    it(`negated mention "${phrase}" raises no calculator warning`, () => {
      const q = valid();
      q.paper = 'P1'; q.calculatorAllowed = false;
      q.parts[0].prompt = `Find the exact value of v(3). ${phrase}`;
      assert.equal(hasWarn(validateQuestion(q), 'calculator-wording'), false);
    });
  }

  // The opposite direction: genuine calculator USE must still be detected.
  for (const phrase of ['Use the GDC to find the root.', 'Read the value off the calculator.']) {
    it(`genuine use "${phrase}" IS still flagged on a non-calculator paper`, () => {
      const q = valid();
      q.paper = 'P1'; q.calculatorAllowed = false;
      q.parts[0].markSchemeLines[0].text = phrase;
      assert.ok(hasWarn(validateQuestion(q), 'calculator-wording'));
    });
  }
});

describe('§7 — difficultyPosition is declared, never inferred', () => {
  it('permits exactly early | mid | late', () => {
    assert.deepEqual(DIFFICULTY_POSITIONS, ['early', 'mid', 'late']);
  });

  it('missing difficultyPosition is an error', () => {
    const q = valid(); delete q.difficultyPosition;
    assert.ok(hasError(validateQuestion(q), 'difficulty-position'));
  });

  it('a named tier such as "hard" is rejected (§11 decision 1)', () => {
    const q = valid(); q.difficultyPosition = 'hard';
    assert.ok(hasError(validateQuestion(q), 'difficulty-position'));
  });

  for (const pos of ['early', 'mid', 'late']) {
    it(`accepts difficultyPosition="${pos}"`, () => {
      const q = valid(); q.difficultyPosition = pos;
      assert.ok(validateQuestion(q).ok);
    });
  }
});

describe('§5.5 — alternative-method routes', () => {
  it('METHOD 1 / METHOD 2 passes', () => {
    const r = validateQuestion(withAlts(['METHOD 1', 'METHOD 2']));
    assert.ok(r.ok, JSON.stringify(r.errors));
  });

  it('EITHER / OR passes', () => {
    assert.ok(validateQuestion(withAlts(['EITHER', 'OR'])).ok);
  });

  it('mixed conventions are an error', () => {
    assert.ok(hasError(validateQuestion(withAlts(['METHOD 1', 'OR'])), 'alternative-methods'));
  });

  it('non-sequential numbering is an error', () => {
    assert.ok(hasError(validateQuestion(withAlts(['METHOD 1', 'METHOD 3'])), 'alternative-methods'));
  });

  it('a single route is an error', () => {
    assert.ok(hasError(validateQuestion(withAlts(['METHOD 1'])), 'alternative-methods'));
  });

  it('both markSchemeLines and alternativeMethods is an error', () => {
    const q = withAlts(['METHOD 1', 'METHOD 2']);
    q.parts[0].markSchemeLines = [{ annotation: 'M1', text: 'x' }];
    assert.ok(hasError(validateQuestion(q), 'mark-scheme'));
  });

  it('neither route present is an error', () => {
    const q = valid(); delete q.parts[0].markSchemeLines;
    assert.ok(hasError(validateQuestion(q), 'mark-scheme'));
  });

  it('each route must independently award the part marks', () => {
    const q = withAlts(['METHOD 1', 'METHOD 2']);
    q.parts[0].alternativeMethods[1].lines = [{ annotation: 'M1', text: 'only one mark' }];
    assert.ok(hasError(validateQuestion(q), 'mark-scheme'));
  });

  it('an empty route is an error', () => {
    const q = withAlts(['EITHER', 'OR']);
    q.parts[0].alternativeMethods[1].lines = [];
    assert.ok(hasError(validateQuestion(q), 'alternative-methods'));
  });

  it('"Hence or otherwise" without alternatives warns', () => {
    const q = valid(); q.parts[0].commandTerm = 'Hence or otherwise';
    assert.ok(hasWarn(validateQuestion(q), 'command-term'));
  });

  it('"Hence" WITH alternatives warns, but never blocks', () => {
    const q = withAlts(['METHOD 1', 'METHOD 2']);
    q.parts[0].commandTerm = 'Hence';
    const r = validateQuestion(q);
    assert.ok(hasWarn(r, 'command-term'));
    assert.ok(r.ok);
  });
});

describe('§10 items 1 & 2 — AHL leak and course exclusivity', () => {
  it('AHL content in an SL question is an error (the §2.3 gate)', () => {
    const q = valid(); q.subtopicCodes = ['AHL5.13'];
    const r = validateQuestion(q);
    assert.ok(hasError(r, 'ahl-in-sl'));
    assert.equal(r.ok, false);
  });

  it('the same AHL code at HL is fine', () => {
    const q = valid(); q.level = 'HL'; q.subtopicCodes = ['AHL5.13'];
    assert.equal(hasError(validateQuestion(q), 'ahl-in-sl'), false);
  });

  it('AHL5.9 is rejected in AA (no such code)', () => {
    const q = valid(); q.level = 'HL'; q.subtopicCodes = ['AHL5.9'];
    assert.ok(hasError(validateQuestion(q), 'course-exclusivity'));
  });

  it('AHL5.9 is accepted in AI', () => {
    const q = valid(); q.course = 'AI'; q.level = 'HL'; q.subtopicCodes = ['AHL5.9'];
    assert.equal(hasError(validateQuestion(q), 'course-exclusivity'), false);
  });

  it('Paper 3 at SL is an error', () => {
    const q = valid(); q.paper = 'P3';
    assert.ok(hasError(validateQuestion(q), 'paper-availability'));
  });
});

describe('§10 items 5 & 6 — mark format and annotations', () => {
  it('a missing [N marks] allocation is an error', () => {
    const q = valid(); q.parts[0].allocationLine = 'M1, A1';
    assert.ok(hasError(validateQuestion(q), 'mark-format'));
  });

  it('an allocation/part mark mismatch is an error', () => {
    const q = valid();
    q.parts[0].allocationLine = '[M1 for differentiating, A1 for answer — 9 marks]';
    assert.ok(hasError(validateQuestion(q), 'mark-format'));
  });

  it('a malformed Total line is an error', () => {
    const q = valid(); q.totalLine = 'Total: 5 marks';
    assert.ok(hasError(validateQuestion(q), 'mark-format'));
  });

  it('parts not summing to totalMarks is an error', () => {
    const q = valid(); q.totalMarks = 9;
    assert.ok(hasError(validateQuestion(q), 'mark-format'));
  });

  it('an invented annotation (B1) is an error', () => {
    const q = valid(); q.parts[0].markSchemeLines[0].annotation = 'B1';
    assert.ok(hasError(validateQuestion(q), 'mark-scheme'));
  });

  it('annotations not summing to the part marks is an error', () => {
    const q = valid(); q.parts[1].markSchemeLines[1].annotation = 'A1';  // 2, not 3
    assert.ok(hasError(validateQuestion(q), 'mark-scheme'));
  });

  it('exceeding the whole-paper budget is an error', () => {
    const q = valid();
    q.parts[0].marks = 100;
    q.parts[0].allocationLine = '[M1 for differentiating, A1 for answer — 100 marks]';
    q.totalMarks = 103; q.totalLine = 'Total: [103 marks]';
    assert.ok(hasError(validateQuestion(q), 'mark-budget'));
  });
});

describe('§10 item 4 — unknown command terms flag, never fail', () => {
  it('an unknown term warns', () => {
    const q = valid(); q.parts[0].commandTerm = 'Elucidate';
    assert.ok(hasWarn(validateQuestion(q), 'command-term'));
  });

  it('an unknown term does not block', () => {
    const q = valid(); q.parts[0].commandTerm = 'Elucidate';
    assert.ok(validateQuestion(q).ok);
  });

  it('"Show that" without AG warns (heuristic)', () => {
    const q = valid(); q.parts[0].commandTerm = 'Show that';
    assert.ok(hasWarn(validateQuestion(q), 'command-term'));
  });

  it('"Prove" at SL warns but never blocks', () => {
    const q = valid(); q.parts[0].commandTerm = 'Prove';
    const r = validateQuestion(q);
    assert.ok(hasWarn(r, 'command-term'));
    assert.ok(r.ok);
  });
});

describe('§10 items 7 & 10 — semantic items are reported as unverified', () => {
  it('P3 warns that incline of difficulty was NOT verified, quoting the declared position', () => {
    const q = valid(); q.level = 'HL'; q.paper = 'P3'; q.difficultyPosition = 'late';
    const r = validateQuestion(q);
    assert.ok(hasWarn(r, 'incline-of-difficulty'));
    const msg = r.warnings.find((f) => f.check === 'incline-of-difficulty').message;
    assert.match(msg, /NOT verified/);
    assert.match(msg, /late/);
  });

  // NOTE: this originally asserted that ANY missing convention warns, including
  // for the exact answer "v(3) = 12". That encoded the pre-fix behaviour, which
  // wrongly demanded "3 s.f." of exact results. The rule is now: warn only when
  // a decimal answer shows rounding is genuinely involved.
  it('a decimal answer with no stated convention warns', () => {
    const q = valid();
    q.parts[0].prompt = 'Find the velocity when t = 3.';
    q.parts[0].markSchemeLines[1].text = 'v(3) = 12.4';
    assert.ok(hasWarn(validateQuestion(q), 'accuracy-convention'));
  });

  it('an exact answer with no stated convention does NOT warn', () => {
    const q = valid();
    q.parts[0].prompt = 'Find the velocity when t = 3.';
    q.parts[0].markSchemeLines[1].text = 'v(3) = 12';
    assert.equal(hasWarn(validateQuestion(q), 'accuracy-convention'), false);
  });

  it('originality always warns as a standing manual spot-check', () => {
    assert.ok(hasWarn(validateQuestion(valid()), 'originality'));
  });
});

// ---------------------------------------------------------------------------
// Regression fixtures from the FIRST LIVE GENERATION (AA SL P1, SL2.7).
// Reproduced verbatim from real model output. All three warnings it produced
// were miscalibrations in this validator, not defects in the question — the
// mathematics was independently verified correct.
// ---------------------------------------------------------------------------
const liveAaSlDiscriminant = () => ({
  course: 'AA', level: 'SL', paper: 'P1',
  calculatorAllowed: false,
  difficultyPosition: 'early',
  subtopicCodes: ['SL2.7'],
  totalMarks: 6,
  totalLine: 'Total: [6 marks]',
  parts: [
    {
      label: '(a)', commandTerm: 'Show that', marks: 2,
      prompt: 'The quadratic equation x² + (k − 2)x + (2k + 1) = 0, where k ∈ ℝ, has two equal roots for certain values of k. Show that the discriminant of the equation is given by Δ = k² − 12k.',
      allocationLine: '[M1 for correct substitution into b² − 4ac, A1 for correct expansion leading to the given result — 2 marks]',
      markSchemeLines: [
        { annotation: 'M1', text: 'Δ = (k − 2)² − 4(1)(2k + 1)' },
        { annotation: 'A1', text: '= k² − 4k + 4 − 8k − 4 = k² − 12k  (AG)' },
      ],
    },
    {
      label: '(b)', commandTerm: 'Find', marks: 2,
      prompt: 'Hence find the values of k for which the equation has two equal roots.',
      allocationLine: '[M1 for setting the discriminant equal to zero and solving, A1 for both correct values of k — 2 marks]',
      markSchemeLines: [
        { annotation: 'M1', text: 'Equal roots ⇒ Δ = 0, so k² − 12k = 0 ⇒ k(k − 12) = 0' },
        { annotation: 'A1', text: 'k = 0 or k = 12' },
      ],
    },
    {
      label: '(c)', commandTerm: 'Determine', marks: 2,
      prompt: 'For each value of k found in part (b), determine the corresponding repeated root of the equation.',
      allocationLine: '[M1 for substituting each value of k and recognising the resulting perfect square, A1 for both correct roots — 2 marks]',
      markSchemeLines: [
        { annotation: 'M1', text: 'k = 0: x² − 2x + 1 = 0 ⇒ (x − 1)² = 0;  k = 12: x² + 10x + 25 = 0 ⇒ (x + 5)² = 0' },
        { annotation: 'A1', text: 'Repeated roots: x = 1 (when k = 0) and x = −5 (when k = 12)' },
      ],
    },
  ],
});

describe('live-output regressions — AA SL discriminant question', () => {
  it('still passes validation with no errors', () => {
    const r = validateQuestion(liveAaSlDiscriminant());
    assert.ok(r.ok, JSON.stringify(r.errors));
  });

  it('FIX 1: inline "(AG)" in the answer line satisfies "Show that"', () => {
    const r = validateQuestion(liveAaSlDiscriminant());
    const agWarn = r.warnings.find((w) => /would normally carry AG/.test(w.message));
    assert.equal(agWarn, undefined, 'inline (AG) was not recognised');
  });

  it('FIX 1: "Show that" with NO AG anywhere still warns', () => {
    const q = liveAaSlDiscriminant();
    q.parts[0].markSchemeLines[1].text = '= k² − 4k + 4 − 8k − 4 = k² − 12k';   // AG removed
    const r = validateQuestion(q);
    assert.ok(r.warnings.some((w) => /would normally carry AG/.test(w.message)));
  });

  it('FIX 1: a standalone AG annotation is still accepted', () => {
    const q = liveAaSlDiscriminant();
    q.parts[0].markSchemeLines[1] = { annotation: 'AG', text: 'k² − 12k' };
    q.parts[0].marks = 1;
    q.parts[0].allocationLine = '[M1 for substitution — 1 mark]';
    q.totalMarks = 5; q.totalLine = 'Total: [5 marks]';
    const r = validateQuestion(q);
    assert.equal(r.warnings.some((w) => /would normally carry AG/.test(w.message)), false);
  });

  it('FIX 2: an all-exact question raises no accuracy-convention warning', () => {
    const r = validateQuestion(liveAaSlDiscriminant());
    assert.equal(hasWarn(r, 'accuracy-convention'), false,
      'demanded an accuracy convention for exact integer answers');
  });

  it('FIX 2: a decimal answer with no stated convention DOES warn', () => {
    const q = liveAaSlDiscriminant();
    q.parts[1].markSchemeLines[1].text = 'k = 0 or k = 12.47';
    assert.ok(hasWarn(validateQuestion(q), 'accuracy-convention'));
  });

  it('FIX 2: a decimal answer WITH a stated convention does not warn', () => {
    const q = liveAaSlDiscriminant();
    q.parts[1].markSchemeLines[1].text = 'k = 0 or k = 12.47 (3 s.f.)';
    assert.equal(hasWarn(validateQuestion(q), 'accuracy-convention'), false);
  });

  it('FIX 3: prompt says "Hence find" but commandTerm is "Find" — drift is flagged', () => {
    const r = validateQuestion(liveAaSlDiscriminant());
    const drift = r.warnings.find((w) => w.check === 'command-term-drift');
    assert.ok(drift, 'command-term drift went undetected');
    assert.equal(drift.detail.declared, 'Find');
    assert.equal(drift.detail.inPrompt, 'Hence');
  });

  it('FIX 3: declaring "Hence" for a "Hence" prompt does not drift', () => {
    const q = liveAaSlDiscriminant();
    q.parts[1].commandTerm = 'Hence';
    assert.equal(hasWarn(validateQuestion(q), 'command-term-drift'), false);
  });

  it('FIX 3: "Hence or otherwise" is not mistaken for bare "Hence"', () => {
    const q = liveAaSlDiscriminant();
    q.parts[1].prompt = 'Hence or otherwise, find the values of k.';
    q.parts[1].commandTerm = 'Hence or otherwise';
    assert.equal(hasWarn(validateQuestion(q), 'command-term-drift'), false);

    q.parts[1].commandTerm = 'Hence';   // now genuinely wrong
    const drift = validateQuestion(q).warnings.find((w) => w.check === 'command-term-drift');
    assert.equal(drift.detail.inPrompt, 'Hence or otherwise');
  });

  it('FIX 3: a prompt with no method-locking language never drifts', () => {
    const q = liveAaSlDiscriminant();
    assert.equal(
      validateQuestion(q).warnings.filter((w) => w.check === 'command-term-drift' && w.message.includes('(c)')).length,
      0
    );
  });

  it('drift is a warning, never a blocking error', () => {
    const r = validateQuestion(liveAaSlDiscriminant());
    assert.equal(r.errors.some((e) => e.check === 'command-term-drift'), false);
    assert.ok(r.ok);
  });
});

describe('§2.5 — worksheet-first paper validation', () => {
  it('a 10-mark worksheet is valid with no budget finding', () => {
    const r = validatePaper([valid(), valid()]);
    assert.ok(r.ok, JSON.stringify(r.errors));
    assert.equal(r.findings.some((f) => f.check === 'mark-budget'), false);
  });

  it('reports the worksheet total', () => {
    assert.equal(validatePaper([valid(), valid()]).totalMarks, 10);
  });

  it('exam simulation enforces the paper budget', () => {
    const r = validatePaper([valid(), valid()], {
      examSimulation: true, course: 'AA', level: 'SL', paper: 'P2',
    });
    assert.ok(r.errors.some((f) => f.check === 'mark-budget'));
  });

  it('findings carry the originating question index', () => {
    const r = validatePaper([valid(), valid()]);
    assert.ok(r.findings.every((f) => f.question >= 1));
  });
});
