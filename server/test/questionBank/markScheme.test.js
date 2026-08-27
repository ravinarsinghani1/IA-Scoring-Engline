// §5.1 / §5.2 / §5.5 / §2.4 mark scheme — ported from the pre-commit suite.

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
  ANNOTATION_CODES, CHAINING_RULES, parseAnnotation, isValidAnnotation,
  annotationMarkTotal, formatMarkCount, formatSubPartAllocation, formatTotalLine,
  parseSubPartMarks, parseTotalLine, markSchemePromptGuidance,
  methodLabelStyle, isValidMethodLabelSet,
} from '../../src/services/questionBank/markScheme.js';

describe('§5.1 annotation codes', () => {
  it('defines M, A, R and AG', () => {
    for (const k of ['M', 'A', 'R', 'AG']) assert.ok(ANNOTATION_CODES[k], `missing ${k}`);
  });

  it('AG awards no marks (they live in the working)', () => {
    assert.equal(ANNOTATION_CODES.AG.awardsMarks, false);
  });

  it('M, A and R award marks', () => {
    for (const k of ['M', 'A', 'R']) assert.equal(ANNOTATION_CODES[k].awardsMarks, true);
  });
});

describe('annotation parsing', () => {
  const cases = [
    ['M1A1', 2, 2],
    ['A1A1', 2, 2],
    ['M1', 1, 1],
    ['R1', 1, 1],
    ['M2', 1, 2],
    ['A2', 1, 2],
    ['AG', 1, 0],
    ['(M1)A1', 2, 2],
    ['A0A1A1', 3, 2],   // §5.2 worked example: wrong first value, next two right
    ['M1A1R1', 3, 3],
  ];

  for (const [input, tokens, marks] of cases) {
    it(`'${input}' -> ${tokens} token(s), ${marks} mark(s)`, () => {
      assert.equal(parseAnnotation(input).length, tokens);
      assert.equal(annotationMarkTotal(input), marks);
    });
  }

  it('brackets mark an implied mark', () => {
    assert.equal(parseAnnotation('(M1)')[0].implied, true);
    assert.equal(parseAnnotation('M1')[0].implied, false);
  });
});

describe('annotation validity', () => {
  for (const bad of ['B1', 'M', '', 'foo', 'X1', 'M1 extra words']) {
    it(`rejects '${bad}'`, () => assert.equal(isValidAnnotation(bad), false));
  }
  for (const good of ['M1A1', 'AG', '(M1)A1', 'R1']) {
    it(`accepts '${good}'`, () => assert.equal(isValidAnnotation(good), true));
  }
});

describe('§2.4 output format', () => {
  it('renders the sub-part allocation line exactly as specified', () => {
    const line = formatSubPartAllocation([
      { annotation: 'M1', reason: 'for correct GDC setup' },
      { annotation: 'A1', reason: 'for answer' },
    ]);
    assert.equal(line, '[M1 for correct GDC setup, A1 for answer — 2 marks]');
    assert.equal(parseSubPartMarks(line), 2);
  });

  it('a hyphen inside the reason does not confuse the parser', () => {
    const line = formatSubPartAllocation([
      { annotation: 'M1', reason: 'for correct GDC set-up' },
      { annotation: 'A1A1', reason: 'for both values' },
    ]);
    assert.equal(parseSubPartMarks(line), 3);
  });

  it('total line round-trips', () => {
    assert.equal(parseTotalLine(formatTotalLine(7)), 7);
  });

  it('total line is found inside a larger body', () => {
    assert.equal(parseTotalLine('...working...\nTotal: [12 marks]\n'), 12);
  });

  it('missing total line yields null', () => {
    assert.equal(parseTotalLine('no total here'), null);
  });

  it('pluralises correctly', () => {
    assert.equal(formatMarkCount(1), '[1 mark]');
    assert.equal(formatMarkCount(3), '[3 marks]');
    assert.ok(formatSubPartAllocation([{ annotation: 'A1', reason: 'for answer' }]).endsWith('— 1 mark]'));
  });
});

describe('prompt guidance is derived from the data', () => {
  const g = markSchemePromptGuidance();

  it('names all four codes', () => {
    for (const s of ['M —', 'A —', 'R —', 'AG —']) assert.ok(g.includes(s), `missing ${s}`);
  });

  it('includes every §5.2 chaining rule verbatim', () => {
    for (const r of CHAINING_RULES) assert.ok(g.includes(r), `missing rule: ${r}`);
  });

  // Regression: a live full-paper build failed §10 validation with "Part
  // d(i): annotations award 3 marks but the part is worth 2" — the model's
  // own annotation sum drifted from its declared mark value, on a later
  // sub-part of a long question. Nothing previously told the model to check
  // this itself; the validator only catches it AFTER the fact.
  it('explicitly instructs the model to cross-check its own annotation sum against the part marks', () => {
    assert.match(g, /ADD UP the marks/);
    assert.match(g, /sum\s+MUST\s+exactly\s+equal\s+this\s+sub-part's\s+declared\s+mark\s+value/);
    assert.match(g, /drift\s+is\s+most\s+common\s+there/i); // targets the observed later-sub-part failure mode
  });

  it('shows the closing Total line', () => {
    assert.ok(g.includes('Total: [N marks]'));
  });
});

describe('§5.5 alternative-method labels', () => {
  const cases = [
    [['METHOD 1', 'METHOD 2'], 'numbered'],
    [['METHOD 1', 'METHOD 2', 'METHOD 3'], 'numbered'],
    [['method 1', 'method 2'], 'numbered'],   // case-insensitive
    [['EITHER', 'OR'], 'either-or'],
    [['either', 'or'], 'either-or'],
    [['METHOD 1', 'METHOD 3'], null],         // non-sequential
    [['METHOD 2', 'METHOD 1'], null],         // out of order
    [['METHOD 1', 'OR'], null],               // mixed conventions
    [['EITHER', 'METHOD 2'], null],           // mixed conventions
    [['OR', 'EITHER'], null],                 // wrong order
    [['EITHER'], null],                       // needs at least two
    [['METHOD 1'], null],                     // needs at least two
    [[], null],
  ];

  for (const [labels, expected] of cases) {
    it(`[${labels.join(', ')}] -> ${expected}`, () => {
      assert.equal(methodLabelStyle(labels), expected);
    });
  }

  it('isValidMethodLabelSet agrees with methodLabelStyle', () => {
    assert.equal(isValidMethodLabelSet(['EITHER', 'OR']), true);
    assert.equal(isValidMethodLabelSet(['METHOD 1', 'OR']), false);
  });
});
