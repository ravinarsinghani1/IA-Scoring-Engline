// §2.1 topic weighting — ported from the pre-commit verification suite.

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
  TEACHING_HOURS, totalHours, topicWeights, sampleTopic, allocateByWeight,
} from '../../src/services/questionBank/weighting.js';

// The §2.1 table, retyped independently of the module so this is a genuine
// cross-check rather than a tautology.
const EXPECTED = {
  AA: { SL: [19, 21, 25, 27, 28], HL: [39, 32, 51, 33, 55] },
  AI: { SL: [16, 31, 18, 36, 19], HL: [29, 42, 46, 52, 41] },
};

describe('weighting — hours match the §2.1 table', () => {
  for (const course of ['AA', 'AI']) {
    for (const level of ['SL', 'HL']) {
      it(`${course} ${level} hours are [${EXPECTED[course][level]}]`, () => {
        const got = [1, 2, 3, 4, 5].map((t) => TEACHING_HOURS[course][level][t]);
        assert.deepEqual(got, EXPECTED[course][level]);
      });

      it(`${course} ${level} totals ${level === 'SL' ? 120 : 210} hours`, () => {
        assert.equal(totalHours(course, level), level === 'SL' ? 120 : 210);
      });
    }
  }
});

describe('weighting — derived percentages (never a flat 20%)', () => {
  for (const course of ['AA', 'AI']) {
    for (const level of ['SL', 'HL']) {
      it(`${course} ${level} weights sum to exactly 1`, () => {
        const sum = topicWeights(course, level).reduce((a, r) => a + r.weight, 0);
        assert.ok(Math.abs(sum - 1) < 1e-12, `sum was ${sum}`);
      });

      it(`${course} ${level} is not a flat 20% split`, () => {
        const rows = topicWeights(course, level);
        const allTwenty = rows.every((r) => Math.abs(r.percent - 20) < 0.05);
        assert.equal(allTwenty, false);
      });
    }
  }

  it('AI SL Statistics is 30% and Number & Algebra 13.3% (the spread the flat split erased)', () => {
    const rows = topicWeights('AI', 'SL');
    assert.equal(rows.find((r) => r.topic === 4).percent, 30);
    assert.equal(rows.find((r) => r.topic === 1).percent, 13.3);
  });

  it('AI HL Functions being exactly 20% is a genuine coincidence, not a flat split', () => {
    const rows = topicWeights('AI', 'HL');
    assert.equal(rows.find((r) => r.topic === 2).percent, 20);
    assert.ok(rows.some((r) => r.percent !== 20));
  });
});

describe('weighting — allocateByWeight (largest remainder)', () => {
  for (const n of [0, 1, 3, 5, 8, 12, 20, 37]) {
    it(`allocate(${n}) sums to exactly ${n} with no negatives`, () => {
      const alloc = allocateByWeight('AA', 'HL', n);
      assert.equal(alloc.reduce((a, r) => a + r.count, 0), n);
      assert.ok(alloc.every((r) => r.count >= 0));
    });
  }

  it('covers all five topics', () => {
    assert.equal(allocateByWeight('AI', 'SL', 12).length, 5);
  });
});

describe('weighting — sampleTopic follows hour ratios', () => {
  it('60k seeded draws track the weights within 1 percentage point', () => {
    let seed = 12345;
    const rng = () => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed / 0x7fffffff; };
    const counts = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
    const N = 60000;
    for (let i = 0; i < N; i++) counts[sampleTopic('AI', 'HL', rng)]++;

    for (const row of topicWeights('AI', 'HL')) {
      const observed = counts[row.topic] / N;
      assert.ok(
        Math.abs(observed - row.weight) < 0.01,
        `topic ${row.topic}: observed ${(observed * 100).toFixed(1)}% vs expected ${row.percent}%`
      );
    }
  });
});

describe('weighting — error handling (no silent defaults)', () => {
  it('unknown course throws 400', () => {
    assert.throws(() => totalHours('XX', 'SL'), (e) => e.status === 400);
  });

  it('negative count throws 400', () => {
    assert.throws(() => allocateByWeight('AA', 'SL', -1), (e) => e.status === 400);
  });
});
