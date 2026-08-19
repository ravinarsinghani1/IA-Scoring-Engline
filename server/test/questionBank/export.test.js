// Export pipeline — PDF/Word generation is pure formatting on already-built
// content, so these are structural/smoke tests (correct file signature,
// non-empty, options actually change the output) rather than pixel-level
// layout checks.

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { renderPaperPdf, renderPaperDocx } from '../../src/services/questionBank/export.js';

function samplePaper() {
  return {
    course: 'AA', level: 'SL', paper: 'P2', totalMarks: 8, questionCount: 1,
    questions: [
      {
        number: 1, subtopicCodes: ['SL5.9'], totalMarks: 8,
        totalLine: 'Total: [8 marks]',
        parts: [
          {
            label: '(a)', commandTerm: 'Find', marks: 3,
            prompt: 'Find the derivative.',
            allocationLine: '[M1A1A1 — 3 marks]',
            markSchemeLines: [{ annotation: 'M1', text: 'Differentiate.' }, { annotation: 'A1', text: 'Correct answer.' }],
          },
          {
            label: '(b)', commandTerm: 'Hence', marks: 5,
            prompt: 'Hence find the stationary points.',
            allocationLine: '[M1A1A1A1A1 — 5 marks]',
            alternativeMethods: [
              { label: 'METHOD 1', lines: [{ annotation: 'M1', text: 'Set derivative to zero.' }] },
              { label: 'METHOD 2', lines: [{ annotation: 'M1', text: 'Graphical approach.' }] },
            ],
          },
        ],
      },
    ],
  };
}

function sampleSingleQuestion() {
  return samplePaper().questions[0]; // same shape generateQuestion() returns
}

describe('export — input handling', () => {
  it('accepts a multi-question paper shape directly', async () => {
    const buf = await renderPaperPdf(samplePaper());
    assert.ok(buf.length > 0);
  });

  it('accepts a single question and wraps it as a 1-question paper', async () => {
    const buf = await renderPaperPdf(sampleSingleQuestion());
    assert.ok(buf.length > 0);
  });

  it('rejects unrecognised input with a 400', async () => {
    await assert.rejects(() => renderPaperPdf({ nonsense: true }), (e) => e.status === 400);
    await assert.rejects(() => renderPaperPdf(null), (e) => e.status === 400);
  });
});

describe('export — PDF', () => {
  it('produces a valid PDF file signature', async () => {
    const buf = await renderPaperPdf(samplePaper());
    assert.equal(buf.subarray(0, 5).toString('ascii'), '%PDF-');
  });

  it('including the mark scheme produces a larger file than omitting it', async () => {
    const withMs = await renderPaperPdf(samplePaper(), { includeMarkScheme: true });
    const without = await renderPaperPdf(samplePaper(), { includeMarkScheme: false });
    assert.ok(withMs.length > without.length);
  });

  it('structured vs unstructured spacing produce different output', async () => {
    const structured = await renderPaperPdf(samplePaper(), { spacing: 'structured' });
    const unstructured = await renderPaperPdf(samplePaper(), { spacing: 'unstructured' });
    assert.notEqual(structured.length, unstructured.length);
  });

  it('a header field, when provided, changes the output', async () => {
    const plain = await renderPaperPdf(samplePaper());
    const withHeader = await renderPaperPdf(samplePaper(), {
      header: { schoolName: 'Test International School', teacherName: 'R. Narsinghani', date: '2026-08-17' },
    });
    assert.notEqual(plain.length, withHeader.length);
  });
});

describe('export — Word (.docx)', () => {
  it('produces a valid ZIP-based .docx file signature ("PK")', async () => {
    const buf = await renderPaperDocx(samplePaper());
    assert.equal(buf.subarray(0, 2).toString('ascii'), 'PK');
  });

  it('including the mark scheme produces a larger file than omitting it', async () => {
    const withMs = await renderPaperDocx(samplePaper(), { includeMarkScheme: true });
    const without = await renderPaperDocx(samplePaper(), { includeMarkScheme: false });
    assert.ok(withMs.length > without.length);
  });

  it('rejects unrecognised input with a 400', async () => {
    await assert.rejects(() => renderPaperDocx({ nonsense: true }), (e) => e.status === 400);
  });
});
