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

/** A paper whose prompt/mark-scheme text carries $...$/$$...$$ math — the shape that used to export as literal LaTeX source (see mathRender.js). */
function paperWithMath() {
  return {
    course: 'AA', level: 'SL', paper: 'P1', totalMarks: 3, questionCount: 1,
    questions: [{
      number: 1, totalMarks: 3,
      parts: [{
        label: '(a)', commandTerm: 'Solve', marks: 3,
        prompt: 'Solve $x^2 - 5x + 6 = 0$.\n$$x = \\frac{-b \\pm \\sqrt{b^2-4ac}}{2a}$$',
        allocationLine: '[M1 for $x=2$, A1 for $x=3$ — 3 marks]',
        markSchemeLines: [{ annotation: 'M1', text: 'for factorising to $(x-2)(x-3)=0$' }],
      }],
    }],
  };
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

  it('a prompt/mark-scheme with math produces embedded image XObjects, not literal LaTeX text', async () => {
    const buf = await renderPaperPdf(paperWithMath(), { includeMarkScheme: true });
    const body = buf.toString('latin1');
    // pdfkit embeds a raster image as an XObject with an /Image subtype —
    // its presence is direct evidence a formula was actually rasterized and
    // placed, not just left as source text.
    assert.match(body, /\/Subtype\s*\/Image/);
    // The raw LaTeX source (with its literal backslash/dollar delimiters)
    // must NOT appear in the PDF's text-showing operators — it was
    // math-typeset instead of printed as source. (A crude but sufficient
    // check: the literal command shouldn't appear as parenthesised PDF text.)
    assert.ok(!body.includes('(\\frac'), 'raw LaTeX source leaked into the PDF as literal text');
  });

  it('a paper with no math at all still renders (the still-plain-text code path stays intact)', async () => {
    const buf = await renderPaperPdf(samplePaper(), { includeMarkScheme: true });
    assert.equal(buf.subarray(0, 5).toString('ascii'), '%PDF-');
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

  it('a prompt/mark-scheme with math embeds PNG images in the docx, not literal LaTeX text', async () => {
    const buf = await renderPaperDocx(paperWithMath(), { includeMarkScheme: true });
    // docx is a ZIP; a real PNG's own file signature landing inside the
    // buffer is direct evidence an image was embedded, not just referenced —
    // stronger than checking file size alone (export.test.js's existing
    // "larger with mark scheme" checks already cover that dimension).
    const pngSignature = Buffer.from('89504e470d0a1a0a', 'hex');
    assert.ok(buf.includes(pngSignature), 'no embedded PNG found in the .docx');
  });
});
