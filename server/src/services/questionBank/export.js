// Tests: server/test/questionBank/export.test.js  (run: npm test, from server/)
//
// Turns an already-generated paper (or a single question, wrapped as a
// 1-question paper) into a downloadable PDF or Word document. This is pure
// formatting on already-validated content — no model call, so it's a normal
// synchronous request, not SSE.
//
// MATH NOTATION — generated content contains LaTeX-style source (e.g.
// "$\sum_{r=1}^n r(r+1)$"), which the browser UI now typesets with KaTeX
// (client/src/components/MathText.jsx). This export used to render that
// LaTeX source as literal text; it's now typeset here too, via mathRender.js
// (MathJax -> SVG -> raster PNG, no headless browser). See mathRender.js's
// header for why that route was chosen over a headless-Chrome/KaTeX
// combination or a full LaTeX engine — both were rejected as too heavy for
// Render's 512MB free-tier instance — and for the two real gotchas found
// while proving it out (resvg-js's default system-font scan, docx's ImageRun
// needing an explicit `type`). Validated first in
// server/scripts/poc-math-export*.mjs before landing here.
//
// FLAGGED FOR REVIEW — spacing amount: the number of ruled lines / gap height
// per mark (see LINES_PER_MARK below) is a simple visual heuristic, not
// derived from any real IB paper's answer-space sizing. Low-stakes (doesn't
// affect content correctness), but noting it's a guess, not a verified
// convention.

import PDFDocument from 'pdfkit';
import {
  Document, Packer, Paragraph, TextRun, ImageRun, HeadingLevel, AlignmentType,
} from 'docx';
import { segmentsOf, renderFormula, svgToPng, EX_TO_EM } from './mathRender.js';

// Render each formula's raster 3x larger than its placed size, for crisp
// print resolution rather than a blurry 1:1 pixel scale — matched against
// the PoC's memory numbers, which stayed well inside budget at this scale.
const MATH_RASTER_SCALE = 3;
// Display math ($$...$$) renders visibly larger than the surrounding text,
// matching how it reads in the browser (MathText.jsx) and in LaTeX itself.
const DISPLAY_MATH_SIZE_MULTIPLIER = 1.4;

/** Ruled lines of answer space per mark, structured-spacing mode. */
const LINES_PER_MARK = 0.8;
const MIN_STRUCTURED_LINES = 2;
const UNSTRUCTURED_GAP_PT = 60; // blank gap height, unstructured mode (PDF points)

/**
 * @typedef {Object} ExportOptions
 * @property {boolean} [includeMarkScheme=false]  append mark schemes + answers
 * @property {'structured'|'unstructured'} [spacing='structured']  answer-space style
 * @property {Object} [header]  editable teacher header, all fields optional
 * @property {string} [header.schoolName]
 * @property {string} [header.teacherName]
 * @property {string} [header.className]
 * @property {string} [header.date]
 * @property {string} [header.instructions]
 */

/** Accept either a paper (buildPaper's shape) or a single question
 *  (generateQuestion's shape) and normalise to one common shape. */
function normalize(input) {
  if (!input || typeof input !== 'object') {
    const err = new Error('Nothing to export.');
    err.status = 400;
    err.expose = true;
    throw err;
  }
  if (Array.isArray(input.questions)) return input; // already paper-shaped
  if (Array.isArray(input.parts)) {
    // Single generated question — wrap as a 1-question paper.
    return {
      course: input.course, level: input.level, paper: input.paper,
      totalMarks: input.totalMarks, questionCount: 1,
      questions: [{ number: 1, ...input }],
    };
  }
  const err = new Error('Unrecognised content shape — expected a paper or a single question.');
  err.status = 400;
  err.expose = true;
  throw err;
}

function linesForMarks(marks) {
  return Math.max(MIN_STRUCTURED_LINES, Math.round(marks * LINES_PER_MARK));
}

// --------------------------------------------------------------------------
// PDF
// --------------------------------------------------------------------------

function ensureRoom(doc, needed) {
  const bottom = doc.page.height - doc.page.margins.bottom;
  if (doc.y + needed > bottom) doc.addPage();
}

/** Same page-break check as ensureRoom, but for the manual y-cursor writeMathText tracks internally (see below) rather than doc.y. */
function ensureSpaceAt(doc, y, needed) {
  const bottom = doc.page.height - doc.page.margins.bottom;
  if (y + needed > bottom) {
    doc.addPage();
    return doc.page.margins.top;
  }
  return y;
}

/**
 * A font's ascender, as a fraction of its point size — used to place inline
 * math on the text baseline rather than guessing. pdfkit exposes this once a
 * font is set (1000-unit em, same convention as OpenType); falls back to a
 * typical sans-serif ratio if unavailable for some reason.
 */
function ascenderRatio(doc) {
  const asc = doc._font?.ascender;
  return typeof asc === 'number' ? asc / 1000 : 0.75;
}

/**
 * Draw `text` (plain prose, possibly containing $...$/$$...$$ math — the
 * exact same segmentation as client/src/components/MathText.jsx) starting at
 * the document's current x/y, wrapping within the page's content width, and
 * leaves doc.x/doc.y positioned for whatever is written next — same contract
 * a plain doc.text() call already gives every caller below.
 *
 * pdfkit's built-in `continued:true` text mode was tried first for this (see
 * server/scripts/poc-inline-math.mjs's "ATTEMPT 1" comment) and produced
 * garbled, overlapping output — it tracks its own internal same-line cursor
 * and ignores a manually-set doc.x between calls; it's meant for switching
 * font/style mid-line, not for interleaving images. This instead lays out
 * every word/formula manually via doc.text(str, x, y, {lineBreak:false})
 * (draws at an exact position, no auto-wrap, no cursor side effects) —
 * reimplementing word-wrap in exchange for full positioning control.
 */
function writeMathText(doc, text, { fontSize = 11, font = 'Helvetica' } = {}) {
  doc.font(font).fontSize(fontSize);
  const contentWidth = doc.page.width - doc.page.margins.left - doc.page.margins.right;
  const lineHeight = doc.currentLineHeight(true) || fontSize * 1.15;
  const ascentPt = ascenderRatio(doc) * fontSize;
  const spaceWidth = doc.widthOfString(' ');

  let x = doc.page.margins.left;
  let y = ensureSpaceAt(doc, doc.y, lineHeight);

  const newLine = () => {
    x = doc.page.margins.left;
    y = ensureSpaceAt(doc, y + lineHeight, lineHeight);
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
    y = ensureSpaceAt(doc, y, heightPt + lineHeight * 0.6);
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
      placeWord(seg.display ? `$$${seg.value}$$` : `$${seg.value}$`); // malformed LaTeX — show raw source rather than nothing
      continue;
    }
    const sizeMultiplier = seg.display ? DISPLAY_MATH_SIZE_MULTIPLIER : 1;
    const heightPt = formula.heightEx * EX_TO_EM * fontSize * sizeMultiplier;
    const valignPt = formula.valignEx * EX_TO_EM * fontSize * sizeMultiplier;
    const { buffer, width: pxW, height: pxH } = svgToPng(formula.svg, heightPt * MATH_RASTER_SCALE);
    const widthPt = heightPt * (pxW / pxH);

    if (seg.display) placeDisplayBlock(buffer, widthPt, heightPt);
    else placeInlineImage(buffer, widthPt, heightPt, valignPt);
  }

  doc.x = doc.page.margins.left;
  doc.y = y + lineHeight;
}

/**
 * @returns {Promise<Buffer>}
 *
 * Deliberately an async wrapper (not returning `new Promise(...)` directly)
 * so that a synchronous validation throw from normalize() becomes a proper
 * rejection rather than an exception thrown out of the call itself — matters
 * for any caller (e.g. the /export route, or a test) that expects to be able
 * to `await` or `.catch()` this uniformly.
 */
export async function renderPaperPdf(input, options = {}) {
  const paper = normalize(input);
  const { includeMarkScheme = false, spacing = 'structured', header = {} } = options;

  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ margin: 50 });
    const chunks = [];
    doc.on('data', (c) => chunks.push(c));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    // --- Header ---------------------------------------------------------
    if (header.schoolName) doc.fontSize(14).font('Helvetica-Bold').text(header.schoolName);
    doc.fontSize(16).font('Helvetica-Bold').text(
      `Mathematics ${paper.course} ${paper.level}${paper.paper ? ` — ${paper.paper}` : ''}`
    );
    doc.fontSize(10).font('Helvetica');
    const metaLine = [
      header.teacherName ? `Teacher: ${header.teacherName}` : null,
      header.className ? `Class: ${header.className}` : null,
      header.date ? `Date: ${header.date}` : null,
      `Total marks: ${paper.totalMarks}`,
    ].filter(Boolean).join('   |   ');
    doc.text(metaLine);
    if (header.instructions) {
      doc.moveDown(0.5);
      doc.font('Helvetica-Oblique').text(header.instructions);
    }
    doc.moveDown(1);
    doc.font('Helvetica');

    // --- Questions --------------------------------------------------------
    for (const q of paper.questions) {
      ensureRoom(doc, 40);
      doc.fontSize(13).font('Helvetica-Bold').text(`Question ${q.number}`);
      doc.moveDown(0.3);

      for (const part of q.parts ?? []) {
        ensureRoom(doc, 30);
        doc.fontSize(11).font('Helvetica-Bold').text(
          `${part.label}  [${part.commandTerm}]  (${part.marks} marks)`
        );
        doc.font('Helvetica');
        writeMathText(doc, part.prompt, { fontSize: 11 });
        doc.moveDown(0.3);

        if (includeMarkScheme) {
          ensureRoom(doc, 20);
          doc.font('Helvetica-Bold').fontSize(10).text('Mark scheme:');
          doc.font('Helvetica');
          if (Array.isArray(part.alternativeMethods)) {
            for (const m of part.alternativeMethods) {
              ensureRoom(doc, 15);
              doc.font('Helvetica-Bold').text(m.label);
              doc.font('Helvetica');
              for (const line of m.lines ?? []) {
                ensureRoom(doc, 12);
                writeMathText(doc, `  ${line.annotation}   ${line.text}`, { fontSize: 10 });
              }
            }
          } else {
            for (const line of part.markSchemeLines ?? []) {
              ensureRoom(doc, 12);
              writeMathText(doc, `  ${line.annotation}   ${line.text}`, { fontSize: 10 });
            }
          }
          if (part.allocationLine) {
            writeMathText(doc, part.allocationLine, { fontSize: 9, font: 'Helvetica-Oblique' });
            doc.font('Helvetica').fontSize(11);
          }
        } else if (spacing === 'structured') {
          const lines = linesForMarks(part.marks);
          for (let i = 0; i < lines; i++) {
            ensureRoom(doc, 22);
            const y = doc.y + 18;
            doc.moveTo(doc.page.margins.left, y)
              .lineTo(doc.page.width - doc.page.margins.right, y)
              .strokeColor('#999999').lineWidth(0.5).stroke();
            doc.y = y + 4;
          }
        } else {
          ensureRoom(doc, UNSTRUCTURED_GAP_PT);
          doc.moveDown(UNSTRUCTURED_GAP_PT / 14); // rough pt-to-line conversion at default font size
        }
        doc.moveDown(0.4);
      }

      if (q.totalLine) {
        doc.fontSize(10).font('Helvetica-Oblique').text(q.totalLine);
        doc.font('Helvetica').fontSize(11);
      }
      doc.moveDown(1);
    }

    doc.end();
  });
}

// --------------------------------------------------------------------------
// Word (.docx)
// --------------------------------------------------------------------------

function emptyRuledParagraph() {
  return new Paragraph({
    spacing: { after: 200 },
    border: { bottom: { style: 'single', size: 4, color: '999999' } },
    children: [new TextRun({ text: '' })],
  });
}

function blankParagraph() {
  return new Paragraph({ spacing: { after: 200 }, children: [new TextRun({ text: '' })] });
}

/** docx's ImageRun transformation width/height are pixels at 96dpi (the OOXML/PowerPoint convention: 1px@96dpi = 9525 EMU) — pt values need this conversion, same 96/72 ratio used nowhere else in this file since pdfkit works natively in points. */
const PT_TO_PX_96DPI = 96 / 72;

/**
 * Build the run list for one paragraph of text that may contain
 * $...$/$$...$$ math (the exact same segmentation as MathText.jsx and the
 * PDF writer's writeMathText above) — a mix of TextRun (prose) and ImageRun
 * (each formula, rasterized the same way as the PDF path). Word places
 * inline images on the text baseline by default (the same convention as an
 * HTML <img>'s default vertical-align), so — unlike the PDF path — no manual
 * baseline math is needed here.
 * @param {string} text
 * @param {{size?: number, italics?: boolean, bold?: boolean}} [opts] `size` is in half-points, docx's own unit (22 = 11pt, matching this file's document default).
 */
function mathTextRuns(text, { size = 22, italics = false, bold = false } = {}) {
  const fontSizePt = size / 2;
  const runs = [];
  for (const seg of segmentsOf(text)) {
    if (seg.type === 'text') {
      if (seg.value === '') continue;
      runs.push(new TextRun({ text: seg.value, italics, bold, size }));
      continue;
    }
    const formula = renderFormula(seg.value, seg.display);
    if (!formula) {
      runs.push(new TextRun({ text: seg.display ? `$$${seg.value}$$` : `$${seg.value}$`, italics, bold, size }));
      continue;
    }
    const sizeMultiplier = seg.display ? DISPLAY_MATH_SIZE_MULTIPLIER : 1;
    const heightPt = formula.heightEx * EX_TO_EM * fontSizePt * sizeMultiplier;
    const { buffer, width: pxW, height: pxH } = svgToPng(formula.svg, heightPt * MATH_RASTER_SCALE);
    const widthPt = heightPt * (pxW / pxH);
    runs.push(new ImageRun({
      type: 'png',
      data: buffer,
      transformation: {
        width: Math.round(widthPt * PT_TO_PX_96DPI),
        height: Math.round(heightPt * PT_TO_PX_96DPI),
      },
    }));
  }
  if (runs.length === 0) runs.push(new TextRun({ text: '', size })); // an all-math or empty line still needs a valid Paragraph
  return runs;
}

/** @returns {Promise<Buffer>} */
export async function renderPaperDocx(input, options = {}) {
  const paper = normalize(input);
  const { includeMarkScheme = false, spacing = 'structured', header = {} } = options;

  const children = [];

  if (header.schoolName) {
    children.push(new Paragraph({ text: header.schoolName, heading: HeadingLevel.HEADING_3 }));
  }
  children.push(new Paragraph({
    text: `Mathematics ${paper.course} ${paper.level}${paper.paper ? ` — ${paper.paper}` : ''}`,
    heading: HeadingLevel.HEADING_1,
  }));
  const metaLine = [
    header.teacherName ? `Teacher: ${header.teacherName}` : null,
    header.className ? `Class: ${header.className}` : null,
    header.date ? `Date: ${header.date}` : null,
    `Total marks: ${paper.totalMarks}`,
  ].filter(Boolean).join('   |   ');
  children.push(new Paragraph({ text: metaLine }));
  if (header.instructions) {
    children.push(new Paragraph({ children: [new TextRun({ text: header.instructions, italics: true })] }));
  }
  children.push(blankParagraph());

  for (const q of paper.questions) {
    children.push(new Paragraph({ text: `Question ${q.number}`, heading: HeadingLevel.HEADING_2 }));

    for (const part of q.parts ?? []) {
      children.push(new Paragraph({
        children: [new TextRun({
          text: `${part.label}  [${part.commandTerm}]  (${part.marks} marks)`, bold: true,
        })],
      }));
      children.push(new Paragraph({ children: mathTextRuns(part.prompt) }));

      if (includeMarkScheme) {
        children.push(new Paragraph({ children: [new TextRun({ text: 'Mark scheme:', bold: true })] }));
        if (Array.isArray(part.alternativeMethods)) {
          for (const m of part.alternativeMethods) {
            children.push(new Paragraph({ children: [new TextRun({ text: m.label, bold: true })] }));
            for (const line of m.lines ?? []) {
              children.push(new Paragraph({ children: mathTextRuns(`${line.annotation}   ${line.text}`) }));
            }
          }
        } else {
          for (const line of part.markSchemeLines ?? []) {
            children.push(new Paragraph({ children: mathTextRuns(`${line.annotation}   ${line.text}`) }));
          }
        }
        if (part.allocationLine) {
          children.push(new Paragraph({ children: mathTextRuns(part.allocationLine, { italics: true }) }));
        }
      } else if (spacing === 'structured') {
        const lines = linesForMarks(part.marks);
        for (let i = 0; i < lines; i++) children.push(emptyRuledParagraph());
      } else {
        children.push(blankParagraph());
        children.push(blankParagraph());
      }
      children.push(blankParagraph());
    }

    if (q.totalLine) {
      children.push(new Paragraph({ children: [new TextRun({ text: q.totalLine, italics: true })] }));
    }
    children.push(blankParagraph());
  }

  const doc = new Document({
    sections: [{ properties: {}, children }],
    styles: { default: { document: { run: { size: 22 } } } }, // 11pt
  });

  return Packer.toBuffer(doc);
}
