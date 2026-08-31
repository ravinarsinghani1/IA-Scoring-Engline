// mathRender.js — LaTeX segmentation and rendering used by export.js's PDF
// and Word writers. Structural/smoke tests (correct segmentation, a formula
// actually produces image bytes, malformed LaTeX degrades gracefully)
// rather than pixel-level rendering checks — same standard export.test.js
// already applies to the PDF/docx output as a whole.

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { segmentsOf, isPlainText, renderFormula, svgToPng } from '../../src/services/questionBank/mathRender.js';

describe('segmentsOf', () => {
  it('returns a single text segment for prose with no math', () => {
    const segs = segmentsOf('Find the derivative of f(x).');
    assert.deepEqual(segs, [{ type: 'text', value: 'Find the derivative of f(x).' }]);
  });

  it('splits inline math ($...$) out from surrounding prose', () => {
    const segs = segmentsOf('Solve $x^2 = 4$ for x.');
    assert.equal(segs.length, 3);
    assert.deepEqual(segs[0], { type: 'text', value: 'Solve ' });
    assert.deepEqual(segs[1], { type: 'math', value: 'x^2 = 4', display: false });
    assert.deepEqual(segs[2], { type: 'text', value: ' for x.' });
  });

  it('splits display math ($$...$$) out and marks it display:true', () => {
    const segs = segmentsOf('$$y = mx + c$$');
    assert.equal(segs.length, 1);
    assert.deepEqual(segs[0], { type: 'math', value: 'y = mx + c', display: true });
  });

  it('handles multiple math segments in one string', () => {
    const segs = segmentsOf('$a$ and $b$ and $c$');
    const mathSegs = segs.filter((s) => s.type === 'math');
    assert.deepEqual(mathSegs.map((s) => s.value), ['a', 'b', 'c']);
  });

  it('returns [] for empty or non-string input', () => {
    assert.deepEqual(segmentsOf(''), []);
    assert.deepEqual(segmentsOf(undefined), []);
    assert.deepEqual(segmentsOf(null), []);
  });
});

describe('isPlainText', () => {
  it('is true for prose with no math (the common case export.js should stay cheap for)', () => {
    assert.equal(isPlainText('Find the derivative.'), true);
  });

  it('is false when math is present', () => {
    assert.equal(isPlainText('Find $f\'(x)$.'), false);
  });
});

describe('renderFormula', () => {
  it('renders a simple formula to an SVG string with ex-based dimensions', () => {
    const f = renderFormula('x^2 + 1', false);
    assert.ok(f, 'expected a render result, got null');
    assert.match(f.svg, /^<svg/);
    assert.ok(f.widthEx > 0);
    assert.ok(f.heightEx > 0);
  });

  it('display mode renders without throwing and returns dimensions too', () => {
    const f = renderFormula('\\sum_{r=1}^n r(r+1)', true);
    assert.ok(f);
    assert.ok(f.widthEx > 0);
  });

  it('malformed LaTeX degrades to a rendered error glyph rather than throwing or crashing the export', () => {
    // MathJax itself is forgiving here — unclosed brace etc. renders an
    // inline "Missing close brace" error node (a merror SVG) instead of
    // throwing, so this still returns a usable result. The behaviour this
    // guards is "never throws out of renderFormula" — see the next test for
    // the case that DOES need the null fallback (a hard internal error).
    const f = renderFormula('\\frac{1', false);
    assert.ok(f, 'expected a graceful (if visibly erroneous) render, not null');
    assert.match(f.svg, /data-mjx-error/);
  });

  it('never throws even on input MathJax cannot render at all', () => {
    // Empty/whitespace-only LaTeX and non-string input are the closest
    // approximation of "MathJax internally throws" available without
    // depending on its private error classes — renderFormula's contract is
    // simply that it never propagates an exception to the caller.
    assert.doesNotThrow(() => renderFormula('', false));
    assert.doesNotThrow(() => renderFormula(undefined, false));
  });
});

describe('svgToPng', () => {
  it('rasterizes a formula\'s SVG to a non-empty PNG buffer at the requested height', () => {
    const f = renderFormula('x = 1', false);
    const { buffer, width, height } = svgToPng(f.svg, 20);
    assert.ok(Buffer.isBuffer(buffer));
    assert.ok(buffer.length > 0);
    assert.equal(buffer.subarray(0, 8).toString('hex'), '89504e470d0a1a0a'); // PNG file signature
    assert.equal(height, 20);
    assert.ok(width > 0);
  });
});
