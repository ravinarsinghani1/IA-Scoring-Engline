// PROOF-OF-CONCEPT #2 — validates INLINE placement (mixed text + math on the
// same line, plus a display-math block) before wiring export.js.
//
// ATTEMPT 1 (pdfkit's `continued:true` text mode + manually mutating doc.x
// between calls) FAILED — garbled/overlapping output. pdfkit's continued
// mode tracks its own internal write cursor for same-line text runs and does
// not pick up a manually-set doc.x; it's designed for switching font/style
// mid-line, not for interleaving arbitrary images. See old poc-inline.pdf if
// still present — visibly broken.
//
// ATTEMPT 2 (this version): manual word-by-word layout. `doc.text(str, x, y,
// {lineBreak:false})` draws at an EXACT given position with no auto-wrap and
// no cursor side effects — full control, in exchange for reimplementing
// word-wrap ourselves (measuring each word/formula with doc.widthOfString
// and our own image-width math, wrapping onto a new line when a token would
// overflow the content width).
//
// Not wired into anything yet. Run: node server/scripts/poc-inline-math.mjs <outDir>

import PDFDocument from 'pdfkit';
import fs from 'node:fs';
import path from 'node:path';
import { segmentsOf, renderFormula, svgToPng, EX_TO_EM } from '../src/services/questionBank/mathRender.js';

const OUT_DIR = process.argv[2] || '.';
const RASTER_SCALE = 3;

function ascenderRatio(doc) {
  const asc = doc._font?.ascender;
  return typeof asc === 'number' ? asc / 1000 : 0.75;
}

function ensureSpace(doc, y, needed) {
  const bottom = doc.page.height - doc.page.margins.bottom;
  if (y + needed > bottom) {
    doc.addPage();
    return doc.page.margins.top;
  }
  return y;
}

/**
 * Draw `text` (plain prose, possibly containing $...$/$$...$$ math) starting
 * at the document's current x/y, wrapping within the page's content width,
 * and leaves doc.x/doc.y positioned for whatever is written next — the same
 * contract callers already expect from a plain doc.text() call.
 */
function writeMathText(doc, text, { fontSize = 11, font = 'Helvetica' } = {}) {
  doc.font(font).fontSize(fontSize);
  const contentWidth = doc.page.width - doc.page.margins.left - doc.page.margins.right;
  const lineHeight = doc.currentLineHeight(true) || fontSize * 1.15;
  const ascentPt = ascenderRatio(doc) * fontSize;
  const spaceWidth = doc.widthOfString(' ');

  let x = doc.page.margins.left;
  let y = ensureSpace(doc, doc.y, lineHeight);

  const newLine = () => {
    x = doc.page.margins.left;
    y = ensureSpace(doc, y + lineHeight, lineHeight);
  };

  const placeWord = (word) => {
    const w = doc.widthOfString(word);
    if (x > doc.page.margins.left && x + w > doc.page.margins.left + contentWidth) newLine();
    doc.text(word, x, y, { lineBreak: false });
    x += w + spaceWidth;
  };

  const placeInlineImage = (buffer, widthPt, heightPt, valignPt) => {
    if (x > doc.page.margins.left && x + widthPt > doc.page.margins.left + contentWidth) newLine();
    const baselineY = y + ascentPt;
    const topY = baselineY - valignPt - heightPt;
    doc.image(buffer, x, topY, { width: widthPt, height: heightPt });
    x += widthPt + spaceWidth;
  };

  const placeDisplayBlock = (buffer, widthPt, heightPt) => {
    if (x > doc.page.margins.left) newLine();
    y = ensureSpace(doc, y, heightPt + lineHeight * 0.6);
    const cx = doc.page.margins.left + (contentWidth - widthPt) / 2;
    doc.image(buffer, cx, y, { width: widthPt, height: heightPt });
    y += heightPt + lineHeight * 0.6;
  };

  for (const seg of segmentsOf(text)) {
    if (seg.type === 'text') {
      const lines = seg.value.split('\n');
      lines.forEach((lineText, li) => {
        if (li > 0) newLine();
        for (const word of lineText.split(/\s+/).filter(Boolean)) placeWord(word);
      });
      continue;
    }

    const formula = renderFormula(seg.value, seg.display);
    if (!formula) {
      placeWord(seg.display ? `$$${seg.value}$$` : `$${seg.value}$`); // malformed LaTeX — show raw source
      continue;
    }
    const sizeMultiplier = seg.display ? 1.4 : 1.0;
    const heightPt = formula.heightEx * EX_TO_EM * fontSize * sizeMultiplier;
    const valignPt = formula.valignEx * EX_TO_EM * fontSize * sizeMultiplier;
    const { buffer, width: pxW, height: pxH } = svgToPng(formula.svg, heightPt * RASTER_SCALE);
    const widthPt = heightPt * (pxW / pxH);

    if (seg.display) placeDisplayBlock(buffer, widthPt, heightPt);
    else placeInlineImage(buffer, widthPt, heightPt, valignPt);
  }

  doc.x = doc.page.margins.left;
  doc.y = y + lineHeight;
}

const doc = new PDFDocument({ margin: 50 });
const chunks = [];
doc.on('data', (c) => chunks.push(c));
const done = new Promise((r) => doc.on('end', r));

doc.fontSize(16).font('Helvetica-Bold').text('PoC #2 (attempt 2): manual word-wrap layout');
doc.moveDown();
doc.font('Helvetica');

writeMathText(doc, 'Find the value of $x$ such that $\\log_2(x) + \\log_2(x-2) = 3$. Show your working clearly, line by line, and keep going long enough that this sentence actually wraps onto a second line so the wrap logic gets exercised too.', { fontSize: 11 });
doc.moveDown(1);

writeMathText(doc, 'Hence or otherwise, solve $2^{2x} - 2^{x+3} + 12 = 0$ for $x \\in \\mathbb{R}$, given that', { fontSize: 11 });
writeMathText(doc, '$$y = 2^x \\quad\\Rightarrow\\quad y^2 - 8y + 12 = 0$$', { fontSize: 11 });
writeMathText(doc, 'so that $y = 2$ or $y = 6$, giving $x = 1$ or $x = \\log_2 6$.', { fontSize: 11 });

doc.moveDown(1.5);
doc.fontSize(10).text('Mark scheme line at a smaller font size, to check the baseline math still scales correctly:');
writeMathText(doc, 'M1 for substituting $y = 2^x$', { fontSize: 10 });

doc.end();
await done;
fs.writeFileSync(path.join(OUT_DIR, 'poc-inline.pdf'), Buffer.concat(chunks));
console.log('Wrote poc-inline.pdf');
