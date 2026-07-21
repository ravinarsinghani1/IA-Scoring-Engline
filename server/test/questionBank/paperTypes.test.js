// Paper types (§5.7 calculator policy, mark budgets, §2.5 worksheet-first)
// — ported from the pre-commit verification suite.

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
  PAPER_TYPES, CALCULATOR, EXAM_SIMULATION_DEFAULT, papersFor, findPaperType,
  isPaperAvailable, calculatorPolicy, allowsCalculator, examSimulationTarget, calculatorNote,
} from '../../src/services/questionBank/paperTypes.js';

// Retyped independently from the confirmed budgets as a cross-check.
const EXPECTED = {
  'AA/SL/P1': [80, 90, 'none'], 'AA/SL/P2': [80, 90, 'gdc'],
  'AA/HL/P1': [110, 120, 'none'], 'AA/HL/P2': [110, 120, 'gdc'], 'AA/HL/P3': [55, 60, 'gdc'],
  'AI/SL/P1': [80, 90, 'gdc'], 'AI/SL/P2': [80, 90, 'gdc'],
  'AI/HL/P1': [110, 120, 'gdc'], 'AI/HL/P2': [110, 120, 'gdc'], 'AI/HL/P3': [55, 60, 'gdc'],
};

describe('paper types — budgets, durations, calculator policy', () => {
  it(`defines exactly ${Object.keys(EXPECTED).length} papers`, () => {
    assert.equal(PAPER_TYPES.length, Object.keys(EXPECTED).length);
  });

  for (const [key, [marks, minutes, calc]] of Object.entries(EXPECTED)) {
    const [c, l, p] = key.split('/');
    it(`${key} = ${marks} marks / ${minutes} min / ${calc}`, () => {
      const pt = findPaperType(c, l, p);
      assert.ok(pt, `${key} not found`);
      assert.equal(pt.marks, marks);
      assert.equal(pt.minutes, minutes);
      assert.equal(pt.calculator, calc);
    });
  }
});

describe('paper types — structural rules', () => {
  it('Paper 3 exists only at HL', () => {
    assert.ok(PAPER_TYPES.filter((p) => p.paper === 'P3').every((p) => p.level === 'HL'));
  });

  it('SL offers exactly P1 and P2 in both courses', () => {
    for (const c of ['AA', 'AI']) {
      assert.deepEqual(papersFor(c, 'SL').map((p) => p.paper), ['P1', 'P2']);
    }
  });

  it('HL offers exactly P1, P2 and P3 in both courses', () => {
    for (const c of ['AA', 'AI']) {
      assert.deepEqual(papersFor(c, 'HL').map((p) => p.paper), ['P1', 'P2', 'P3']);
    }
  });

  it('SL Paper 3 is unavailable', () => {
    assert.equal(isPaperAvailable('AA', 'SL', 'P3'), false);
    assert.equal(isPaperAvailable('AI', 'SL', 'P3'), false);
  });
});

describe('§5.7 — only AA Paper 1 is non-calculator', () => {
  it('exactly AA SL P1 and AA HL P1 are non-calculator', () => {
    const nonCalc = PAPER_TYPES
      .filter((p) => p.calculator === CALCULATOR.NONE)
      .map((p) => `${p.course}/${p.level}/${p.paper}`);
    assert.deepEqual(nonCalc, ['AA/SL/P1', 'AA/HL/P1']);
  });

  it('AA P1 disallows a calculator at both levels', () => {
    assert.equal(allowsCalculator('AA', 'SL', 'P1'), false);
    assert.equal(allowsCalculator('AA', 'HL', 'P1'), false);
  });

  it('AI has no non-calculator paper — AI P1 allows a GDC', () => {
    assert.equal(allowsCalculator('AI', 'SL', 'P1'), true);
    assert.equal(allowsCalculator('AI', 'HL', 'P1'), true);
  });

  it('AA P2 allows a calculator', () => {
    assert.equal(allowsCalculator('AA', 'SL', 'P2'), true);
  });
});

describe('§2.5 — worksheet-first, exam simulation opt-in', () => {
  it('EXAM_SIMULATION_DEFAULT is false', () => {
    assert.equal(EXAM_SIMULATION_DEFAULT, false);
  });

  it('no target by default', () => {
    assert.equal(examSimulationTarget('AA', 'HL', 'P1'), null);
  });

  it('no target when explicitly off', () => {
    assert.equal(examSimulationTarget('AA', 'HL', 'P1', { examSimulation: false }), null);
  });

  it('target only when explicitly enabled', () => {
    assert.deepEqual(
      examSimulationTarget('AA', 'HL', 'P1', { examSimulation: true }),
      { marks: 110, minutes: 120 }
    );
  });
});

describe('calculator note wording', () => {
  it('AA P1 states no calculator', () => {
    assert.match(calculatorNote('AA', 'SL', 'P1'), /^No calculator/);
  });

  it('AI P1 states a GDC is required', () => {
    assert.match(calculatorNote('AI', 'SL', 'P1'), /required/);
  });
});

describe('paper types — error handling (no silent defaults)', () => {
  for (const [c, l, p] of [['AA', 'SL', 'P3'], ['AA', 'XL', 'P1'], ['ZZ', 'SL', 'P1']]) {
    it(`${c}/${l}/${p} throws 400 rather than defaulting`, () => {
      assert.throws(() => calculatorPolicy(c, l, p), (e) => e.status === 400);
    });
  }
});
