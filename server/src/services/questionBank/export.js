// Tests: server/test/questionBank/export.test.js  (run: npm test, from server/)
//
// Turns an already-generated paper (or a single question, wrapped as a
// 1-question paper) into a downloadable PDF or Word document. This is pure
// formatting on already-validated content — no model call, so it's a normal
// synchronous request, not SSE.
//
// FLAGGED FOR REVIEW — math notation fidelity: generated content contains
// LaTeX-style source (e.g. "$\sum_{r=1}^n r(r+1)$"), same as what the browser
// UI shows today (client/src/components/QuestionBankView.jsx also renders it
// as plain text, not typeset). This export renders that LaTeX SOURCE as
// literal text too — matching current in-app fidelity exactly, NOT a
// regression introduced here. True math typesetting (rendering $\sum$ as an
// actual sigma with proper layout) would need a heavier renderer — either a
// headless browser running KaTeX/MathJax, or a LaTeX engine. Both were
// deliberately avoided: the Render deployment runs on a 512MB free-tier
// instance, and a headless-Chrome dependency in-process alongside the
// existing Claude API calls risks destabilising the whole service (OOM) for
// a formatting feature. Pure-JS libraries (pdfkit, docx) were chosen instead
// specifically to stay light. Worth reviewing whether raw-LaTeX fidelity is
// acceptable long-term, or whether math typesetting is worth the added infra
// cost/risk later.
//
// FLAGGED FOR REVIEW — spacing amount: the number of ruled lines / gap height
// per mark (see LINES_PER_MARK below) is a simple visual heuristic, not
// derived from any real IB paper's answer-space sizing. Low-stakes (doesn't
// affect content correctness), but noting it's a guess, not a verified
// convention.

import PDFDocument from 'pdfkit';
import {
  Document, Packer, Paragraph, TextRun, HeadingLevel, AlignmentType,
} from 'docx';

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
        doc.font('Helvetica').text(part.prompt);
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
                doc.text(`  ${line.annotation}   ${line.text}`);
              }
            }
          } else {
            for (const line of part.markSchemeLines ?? []) {
              ensureRoom(doc, 12);
              doc.text(`  ${line.annotation}   ${line.text}`);
            }
          }
          if (part.allocationLine) {
            doc.font('Helvetica-Oblique').fontSize(9).text(part.allocationLine);
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
      children.push(new Paragraph({ text: part.prompt }));

      if (includeMarkScheme) {
        children.push(new Paragraph({ children: [new TextRun({ text: 'Mark scheme:', bold: true })] }));
        if (Array.isArray(part.alternativeMethods)) {
          for (const m of part.alternativeMethods) {
            children.push(new Paragraph({ children: [new TextRun({ text: m.label, bold: true })] }));
            for (const line of m.lines ?? []) {
              children.push(new Paragraph({ text: `${line.annotation}   ${line.text}` }));
            }
          }
        } else {
          for (const line of part.markSchemeLines ?? []) {
            children.push(new Paragraph({ text: `${line.annotation}   ${line.text}` }));
          }
        }
        if (part.allocationLine) {
          children.push(new Paragraph({ children: [new TextRun({ text: part.allocationLine, italics: true })] }));
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
