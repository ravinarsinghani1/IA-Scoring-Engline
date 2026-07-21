// §8 taxonomy — ported from the pre-commit verification suite.
// Run with: npm test  (server/)

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
  TAXONOMY, TOPICS, subtopicsFor, subtopicsByTopic,
  findSubtopic, codeExistsInCourse, isAHLCode, topicName, COURSES, STUDENT_LEVELS,
} from '../../src/services/questionBank/taxonomy.js';

describe('taxonomy — entry counts', () => {
  it('has 158 entries in total', () => {
    assert.equal(TAXONOMY.length, 158);
  });

  const expected = {
    AA: { total: 83, SL: 51, AHL: 32, perTopic: [16, 16, 18, 14, 19] },
    AI: { total: 75, SL: 39, AHL: 36, perTopic: [15, 10, 13, 19, 18] },
  };

  for (const [course, exp] of Object.entries(expected)) {
    it(`${course}: ${exp.total} entries (SL ${exp.SL} / AHL ${exp.AHL})`, () => {
      const all = TAXONOMY.filter((e) => e.course === course);
      assert.equal(all.length, exp.total);
      assert.equal(all.filter((e) => e.level === 'SL').length, exp.SL);
      assert.equal(all.filter((e) => e.level === 'AHL').length, exp.AHL);
    });

    it(`${course}: per-topic counts are [${exp.perTopic}]`, () => {
      const got = TOPICS.map((t) => TAXONOMY.filter((e) => e.course === course && e.topic === t.number).length);
      assert.deepEqual(got, exp.perTopic);
    });
  }
});

describe('taxonomy — kinematics traps (the original fabrication bug)', () => {
  it('AA has NO AHL5.9 at all', () => {
    assert.equal(codeExistsInCourse('AA', 'AHL5.9'), false);
  });

  it('AA kinematics is SL5.9', () => {
    assert.match(findSubtopic('AA', 'SL5.9').description, /Kinematics/i);
  });

  it("AA AHL5.13 is L'Hopital's rule, NOT kinematics", () => {
    const d = findSubtopic('AA', 'AHL5.13').description;
    assert.match(d, /Hôpital/i);
    assert.doesNotMatch(d, /kinematic/i);
  });

  it('AI AHL5.13 IS kinematics', () => {
    assert.match(findSubtopic('AI', 'AHL5.13').description, /Kinematic/i);
  });

  it('AI AHL5.9 is derivative rules, NOT kinematics', () => {
    const d = findSubtopic('AI', 'AHL5.9').description;
    assert.match(d, /chain rule/i);
    assert.doesNotMatch(d, /kinematic/i);
  });

  it('AI AHL3.12 is vector kinematics', () => {
    assert.match(findSubtopic('AI', 'AHL3.12').description, /kinematics/i);
  });

  it('AI SL contains no kinematics (SL5.7 excludes it)', () => {
    const slHasKinematics = subtopicsFor('AI', 'SL').some((e) => /kinematic problems/i.test(e.description));
    assert.equal(slHasKinematics, false);
  });
});

describe('taxonomy — §2.3 hard guarantee: SL never yields AHL', () => {
  for (const course of ['AA', 'AI']) {
    it(`${course} SL selection contains zero AHL codes`, () => {
      const leaked = subtopicsFor(course, 'SL').filter((e) => isAHLCode(e.code) || e.level === 'AHL');
      assert.deepEqual(leaked.map((e) => e.code), []);
    });

    it(`${course} HL selection includes both SL and AHL`, () => {
      const hl = subtopicsFor(course, 'HL');
      assert.ok(hl.some((e) => e.level === 'SL'));
      assert.ok(hl.some((e) => e.level === 'AHL'));
    });
  }
});

describe('taxonomy — course exclusivity (§10 item 2)', () => {
  it('Voronoi diagrams (AI SL3.6) are AI-only', () => {
    assert.ok(codeExistsInCourse('AI', 'SL3.6'));
    assert.doesNotMatch(findSubtopic('AA', 'SL3.6')?.description ?? '', /Voronoi/i);
  });

  it('Maclaurin series (AA AHL5.19) is not in AI', () => {
    assert.equal(codeExistsInCourse('AI', 'AHL5.19'), false);
  });

  it('Markov chains (AI AHL4.19) are not in AA', () => {
    assert.equal(codeExistsInCourse('AA', 'AHL4.19'), false);
  });
});

describe('taxonomy — picker shape', () => {
  it('AI SL groups into 5 topics with the expected sizes', () => {
    const picker = subtopicsByTopic('AI', 'SL');
    assert.equal(picker.length, 5);
    assert.deepEqual(picker.map((t) => t.subtopics.length), [8, 6, 6, 11, 8]);
  });

  it('topicName resolves each topic number, and nothing else', () => {
    assert.equal(topicName(1), 'Number and Algebra');
    assert.equal(topicName(5), 'Calculus');
    assert.equal(topicName(99), undefined);
  });

  it('exposes the course and student-level vocabularies', () => {
    assert.deepEqual(COURSES, ['AA', 'AI']);
    assert.deepEqual(STUDENT_LEVELS, ['SL', 'HL']);
  });

  it('course-scoped lookup is required — a code alone is ambiguous', () => {
    // AHL5.13 resolves differently per course; that is the whole point.
    assert.notEqual(findSubtopic('AA', 'AHL5.13').description, findSubtopic('AI', 'AHL5.13').description);
  });
});
