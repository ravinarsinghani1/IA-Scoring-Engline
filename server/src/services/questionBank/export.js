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
// EXAM-PAPER FORMATTING — layout constants (spacing, indentation, colors)
// live together below as SPACE_PT / INDENT_UNIT_PT / MARK_SCHEME_STYLE, one
// set of numbers driving both the PDF and docx writers, specifically so the
// two formats stay visually equivalent rather than drifting apart under
// separate ad-hoc tweaks. Real IB paper conventions approximated here:
// centered title block, parts indented under their question (sub-parts
// indented further, derived from how many "(x)" groups are in the part's own
// label — e.g. "(b)(i)" nests one level deeper than "(a)"), marks
// right-aligned at the margin as "[N]", and the mark scheme visually set off
// from the question (a left border + muted color + indent) since an export
// may go to students with the scheme still attached in some workflows.
//
// FLAGGED FOR REVIEW — spacing amount: the number of ruled lines / gap height
// per mark (see LINES_PER_MARK below) is a simple visual heuristic, not
// derived from any real IB paper's answer-space sizing. Low-stakes (doesn't
// affect content correctness), but noting it's a guess, not a verified
// convention.

import PDFDocument from 'pdfkit';
import {
  Document, Packer, Paragraph, TextRun, ImageRun, AlignmentType, TabStopType,
  docPropertiesUniqueNumericIdGen,
} from 'docx';
import { segmentsOf, renderFormula, svgToPng, EX_TO_EM } from './mathRender.js';

// --- Shared layout constants (drive both writers — see file header) --------

const PAGE_MARGIN_PT = 50;
const PAGE_WIDTH_PT = 612; // US Letter — pdfkit's implicit default; docx's page size is set to match explicitly below
const PAGE_HEIGHT_PT = 792;
const CONTENT_WIDTH_PT = PAGE_WIDTH_PT - 2 * PAGE_MARGIN_PT;
const PT_TO_TWIP = 20;

// One indent step per nesting level (a bare "(a)" is depth 1; "(b)(i)" is
// depth 2) — applied to the part's own label line, its prompt, and its mark
// scheme (which gets one further step — see MARK_SCHEME_STYLE.extraIndentPt).
const INDENT_UNIT_PT = 18;

// A single sans-serif family for both formats, chosen for cross-platform
// availability rather than aesthetics: pdfkit's built-in "Helvetica" needs no
// embedding, and "Arial" is Helvetica's metric-compatible clone, present on
// both Windows and Mac Word installs — so PDF and docx read as the same
// typeface even though neither engine can literally share a font resource.
const PDF_FONT = 'Helvetica';
const PDF_FONT_BOLD = 'Helvetica-Bold';
const PDF_FONT_ITALIC = 'Helvetica-Oblique';
const DOCX_FONT = 'Arial';

// Final polish pass: generous-but-not-excessive rhythm — enough air between
// elements that nothing reads cramped, without the paper feeling sparse.
const SPACE_PT = {
  afterHeaderRule: 20, // gap between the header's closing rule and "Question 1"
  beforeQuestion: 22, // between one question's end and the next question's heading (first question gets none)
  afterQuestionHeading: 9,
  afterPartLabel: 5, // between the "(a) [Find]  [3]" line and the prompt
  afterPrompt: 10, // between the prompt and whatever follows (mark scheme or answer space)
  afterMarkSchemeHeading: 4,
  afterMarkSchemeLine: 3,
  afterAllocationLine: 8,
  afterPart: 17, // between one part's content and the next part's label
  afterTotalLine: 6,
};

// Mark scheme visual treatment — a left border + muted color + extra indent,
// so it reads as clearly separate from the question even with no fill
// (a filled background tint would need measuring each block's height before
// drawing it in pdfkit, since content painted afterward would sit UNDER a
// later fill; a left border avoids that two-pass complexity and is one of
// the treatments explicitly acceptable per the original request).
const MARK_SCHEME_STYLE = {
  extraIndentPt: 14,
  borderColorPdf: '#94a3b8', // slate-400
  borderColorDocx: '94A3B8',
  textColorPdf: '#475569', // slate-600
  textColorDocx: '475569',
  borderWidthPt: 2.5,
};

// Render each formula's raster 3x larger than its placed size, for crisp
// print resolution rather than a blurry 1:1 pixel scale — matched against
// the PoC's memory numbers, which stayed well inside budget at this scale.
const MATH_RASTER_SCALE = 3;
// Display math ($$...$$) renders visibly larger than the surrounding text,
// matching how it reads in the browser (MathText.jsx) and in LaTeX itself.
const DISPLAY_MATH_SIZE_MULTIPLIER = 1.4;

// An inline formula (single $...$) taller than this multiple of the line's
// font size gets auto-promoted to its own centered block, same treatment as
// genuine display math ($$...$$) — WITHOUT the display-math size boost,
// since the source author asked for inline sizing, just not inline FLOW.
// Real fix for a reported bug: a multi-row matrix (e.g. a 3-row \pmatrix
// column vector) is tall/wide enough that it doesn't fit the remaining
// space on its text line, so Word wraps it onto its own line, visually
// detaching it from its sentence — legitimate word-wrap, not corruption,
// confirmed by inspecting the .docx's raw XML (a single valid paragraph,
// no stray paragraph break). The PDF writer's own line-layout already
// avoids this by growing that one line's height to fit the formula, but
// cramming a tall matrix inline is unusual even in raw LaTeX — even without
// Word's behavior, promoting it reads better in both formats. Applying the
// SAME threshold to both writers keeps them looking alike rather than
// diverging on this judgment call.
const INLINE_AUTO_DISPLAY_HEIGHT_RATIO = 1.8;

/** Ruled lines of answer space per mark, structured-spacing mode. */
const LINES_PER_MARK = 0.8;
const MIN_STRUCTURED_LINES = 2;
const UNSTRUCTURED_GAP_PT = 60; // blank gap height, unstructured mode (PDF points)

const COURSE_FULL_NAME = {
  AA: 'ANALYSIS AND APPROACHES',
  AI: 'APPLICATIONS AND INTERPRETATION',
};

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

/** IB-style paper title, e.g. "MATHEMATICS: ANALYSIS AND APPROACHES — STANDARD LEVEL — PAPER 1". */
function paperTitle(paper) {
  const courseName = COURSE_FULL_NAME[paper.course] ?? paper.course;
  const levelName = paper.level === 'HL' ? 'HIGHER LEVEL' : 'STANDARD LEVEL';
  const paperName = paper.paper ? ` — ${String(paper.paper).replace(/^P/i, 'PAPER ')}` : '';
  return `MATHEMATICS: ${courseName} — ${levelName}${paperName}`;
}

function metaLineParts(header, paper) {
  return [
    header.teacherName ? `Teacher: ${header.teacherName}` : null,
    header.className ? `Class: ${header.className}` : null,
    header.date ? `Date: ${header.date}` : null,
    `Total marks: ${paper.totalMarks}`,
  ].filter(Boolean).join('    |    ');
}

/**
 * Nesting depth of a part label, e.g. '(a)' -> 1, '(b)(i)' -> 2 — see
 * validate.js's own '(b)(i)' example for the label convention this reads.
 * Real IB papers indent each level of sub-part further; this is how much.
 */
function partDepth(label) {
  const matches = String(label ?? '').match(/\([^)]*\)/g);
  return matches && matches.length > 0 ? matches.length : 1;
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
 * Rough estimate of the vertical space a part (label + prompt + optionally
 * its mark scheme) will need, used only to decide whether to page-break
 * BEFORE starting the part so it doesn't awkwardly split right after its
 * heading — not a substitute for the real per-line page-breaking
 * writeMathText already does as it goes (which still applies if a part is
 * genuinely longer than a full page). A character-count heuristic (~85
 * characters/line at 11pt over the content width) rather than true
 * measurement, which would need a full dry-run layout pass; good enough to
 * meaningfully reduce awkward splits without that complexity.
 */
function estimatePartHeight(part, includeMarkScheme, spacing) {
  const CHARS_PER_LINE = 85;
  const LINE_PT = 14;
  const linesFor = (s) => Math.max(1, Math.ceil((s?.length ?? 0) / CHARS_PER_LINE));
  let lines = 1 + linesFor(part.prompt); // label line + prompt
  if (includeMarkScheme) {
    const msLines = Array.isArray(part.alternativeMethods)
      ? part.alternativeMethods.flatMap((m) => m.lines ?? [])
      : part.markSchemeLines ?? [];
    lines += 1 + msLines.reduce((s, l) => s + linesFor(l.text), 0) + 1; // "Mark scheme:" + lines + allocation
  } else if (spacing === 'structured') {
    // Each ruled line is drawn 22pt apart (see the structured-spacing branch
    // below) — without this, a part's answer space could start near the
    // bottom of a page and split its ruled lines across the page break,
    // which is exactly the awkward split this estimate exists to prevent.
    lines += linesForMarks(part.marks) * (22 / LINE_PT);
  } else {
    lines += UNSTRUCTURED_GAP_PT / LINE_PT;
  }
  return lines * LINE_PT;
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
 * the document's current y and an indented x, wrapping within the page's
 * (indent-adjusted) content width, and leaves doc.x/doc.y positioned for
 * whatever is written next — same contract a plain doc.text() call already
 * gives every caller below.
 *
 * pdfkit's built-in `continued:true` text mode was tried first for this (see
 * server/scripts/poc-inline-math.mjs's "ATTEMPT 1" comment) and produced
 * garbled, overlapping output — it tracks its own internal same-line cursor
 * and ignores a manually-set doc.x between calls; it's meant for switching
 * font/style mid-line, not for interleaving images. This instead lays out
 * every word/formula manually via doc.text(str, x, y, {lineBreak:false})
 * (draws at an exact position, no auto-wrap, no cursor side effects) —
 * reimplementing word-wrap in exchange for full positioning control.
 *
 * @param {{fontSize?:number, font?:string, indent?:number, color?:string}} [opts]
 *   `indent` shifts the whole block right by that many points (both the left
 *   edge words wrap against and the right-hand wrap boundary stay within the
 *   page's normal margins, so indented text gets a narrower column, exactly
 *   like an indented paragraph). `color` tints the TEXT only — rendered
 *   formulas stay MathJax's own black, a minor, low-stakes inconsistency
 *   against e.g. the muted mark-scheme color, not worth a second raster pass.
 */
/**
 * A font's descender, as a (positive) fraction of its point size — the
 * ascenderRatio companion, same reasoning: real per-line height (see below)
 * needs both how far a line's content reaches above its baseline AND below.
 */
function descenderRatio(doc) {
  const desc = doc._font?.descender;
  return typeof desc === 'number' ? Math.abs(desc) / 1000 : 0.25;
}

function writeMathText(doc, text, { fontSize = 11, font = PDF_FONT, indent = 0, color = '#000000' } = {}) {
  doc.font(font).fontSize(fontSize);
  const left = doc.page.margins.left + indent;
  const contentWidth = doc.page.width - doc.page.margins.right - left;
  const spaceWidth = doc.widthOfString(' ');
  const textAscentPt = ascenderRatio(doc) * fontSize;
  const textDescentPt = descenderRatio(doc) * fontSize;
  const minLineHeight = doc.currentLineHeight(true) || fontSize * 1.15;

  // --- Pass 1: tokenize every segment into words/inline-formulas/explicit
  // breaks/display-blocks, each carrying its own measured width and (for
  // formulas) how far it reaches above/below the text baseline. Nothing is
  // drawn yet — a tall inline formula (a matrix, a stacked fraction) needs
  // its WHOLE line's height known before anything on that line can be
  // positioned, which isn't knowable until every token that ends up sharing
  // the line has been seen. (A fixed line height — this function's first
  // version — overlapped a tall inline formula with the line below it.)
  const tokens = [];
  for (const seg of segmentsOf(text)) {
    if (seg.type === 'text') {
      seg.value.split('\n').forEach((lineText, li) => {
        if (li > 0) tokens.push({ type: 'break' });
        for (const word of lineText.split(/\s+/).filter(Boolean)) {
          tokens.push({ type: 'word', text: word, width: doc.widthOfString(word) });
        }
      });
      continue;
    }
    const formula = renderFormula(seg.value, seg.display);
    if (!formula) {
      const raw = seg.display ? `$$${seg.value}$$` : `$${seg.value}$`; // malformed LaTeX — show raw source rather than nothing
      tokens.push({ type: 'word', text: raw, width: doc.widthOfString(raw) });
      continue;
    }
    const sizeMultiplier = seg.display ? DISPLAY_MATH_SIZE_MULTIPLIER : 1;
    const heightPt = formula.heightEx * EX_TO_EM * fontSize * sizeMultiplier;
    const valignPt = formula.valignEx * EX_TO_EM * fontSize * sizeMultiplier;
    const { buffer, width: pxW, height: pxH } = svgToPng(formula.svg, heightPt * MATH_RASTER_SCALE);
    const widthPt = heightPt * (pxW / pxH);
    const autoDisplay = !seg.display && heightPt > INLINE_AUTO_DISPLAY_HEIGHT_RATIO * fontSize;
    if (seg.display || autoDisplay) {
      tokens.push({ type: 'display', buffer, widthPt, heightPt });
    } else {
      // How far this formula reaches above/below the baseline — see
      // writePartHeaderLine-adjacent comment on valignPt for the sign
      // convention (MathJax's own CSS-style "how far below baseline").
      tokens.push({ type: 'formula', buffer, widthPt, heightPt, ascentPt: heightPt + valignPt, descentPt: Math.max(0, -valignPt) });
    }
  }

  // --- Pass 2: greedy line-breaking — group tokens into lines, wrapping
  // when a word/formula would overflow the content width, exactly like
  // pdfkit's own word-wrap would, but tracked ourselves since we also need
  // each line's resolved height before rendering it.
  const lines = []; // { tokens: [...] } | { display: token }
  let current = [];
  let currentWidth = 0;
  const closeLine = () => { lines.push({ tokens: current }); current = []; currentWidth = 0; };
  for (const tok of tokens) {
    if (tok.type === 'break') { closeLine(); continue; }
    if (tok.type === 'display') { if (current.length > 0) closeLine(); lines.push({ display: tok }); continue; }
    const w = tok.type === 'word' ? tok.width : tok.widthPt;
    if (current.length > 0 && currentWidth + spaceWidth + w > contentWidth) closeLine();
    if (current.length > 0) currentWidth += spaceWidth;
    current.push(tok);
    currentWidth += w;
  }
  closeLine();

  // --- Pass 3: render, now that every line's content — and so its true
  // height — is known.
  let y = doc.y;
  let x = left;
  for (const line of lines) {
    if (line.display) {
      y = ensureSpaceAt(doc, y, line.display.heightPt + minLineHeight * 0.6);
      const cx = left + (contentWidth - line.display.widthPt) / 2;
      doc.image(line.display.buffer, cx, y, { width: line.display.widthPt, height: line.display.heightPt });
      y += line.display.heightPt + minLineHeight * 0.6;
      continue;
    }
    const ascent = Math.max(textAscentPt, ...line.tokens.map((t) => t.ascentPt ?? textAscentPt));
    const descent = Math.max(textDescentPt, ...line.tokens.map((t) => t.descentPt ?? textDescentPt));
    const lineHeight = Math.max(minLineHeight, ascent + descent);
    y = ensureSpaceAt(doc, y, lineHeight);
    const baselineY = y + ascent;

    x = left;
    line.tokens.forEach((tok, i) => {
      if (i > 0) x += spaceWidth;
      if (tok.type === 'word') {
        doc.font(font).fontSize(fontSize).fillColor(color).text(tok.text, x, baselineY - textAscentPt, { lineBreak: false });
        x += tok.width;
      } else {
        doc.image(tok.buffer, x, baselineY - tok.ascentPt, { width: tok.widthPt, height: tok.heightPt });
        x += tok.widthPt;
      }
    });
    y += lineHeight;
  }

  doc.fillColor('#000000');
  doc.x = doc.page.margins.left;
  doc.y = y;
}

/**
 * A part's label line — "(a)  [Find]" on the left, "[3]" right-aligned at
 * the page's content-width margin, IB-paper convention. Two independent
 * single-line doc.text() calls at the same y (each with an explicit x/width
 * and lineBreak:false, so neither auto-wraps or advances the cursor) rather
 * than one call with a tab — pdfkit has no native tab-stop concept.
 */
function writePartHeaderLine(doc, { label, commandTerm, marks, indent = 0 }) {
  const left = doc.page.margins.left + indent;
  const contentWidth = doc.page.width - doc.page.margins.right - left;
  const lineHeight = doc.currentLineHeight(true);
  const y = ensureSpaceAt(doc, doc.y, lineHeight);

  doc.font(PDF_FONT_BOLD).fontSize(11);
  const leftText = commandTerm ? `${label}  [${commandTerm}]` : label;
  doc.text(leftText, left, y, { lineBreak: false });
  doc.text(`[${marks}]`, left, y, { width: contentWidth, align: 'right', lineBreak: false });

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
    const doc = new PDFDocument({ margin: PAGE_MARGIN_PT, size: [PAGE_WIDTH_PT, PAGE_HEIGHT_PT] });
    const chunks = [];
    doc.on('data', (c) => chunks.push(c));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    // --- Header, centered — school name, then the paper's title (bold,
    // largest text on the page — the clear top of the hierarchy), then a
    // smaller meta line and optional instructions, then a rule that visually
    // closes off the header before any question starts. ------------------
    if (header.schoolName) {
      doc.fontSize(13).font(PDF_FONT_BOLD).text(header.schoolName, { align: 'center' });
      doc.moveDown(0.3);
    }
    doc.fontSize(16).font(PDF_FONT_BOLD).text(paperTitle(paper), { align: 'center' });
    doc.moveDown(0.4);
    doc.fontSize(10).font(PDF_FONT).text(metaLineParts(header, paper), { align: 'center' });
    if (header.instructions) {
      doc.moveDown(0.3);
      doc.font(PDF_FONT_ITALIC).text(header.instructions, { align: 'center' });
      doc.font(PDF_FONT);
    }
    doc.moveDown(0.5);
    doc.moveTo(doc.page.margins.left, doc.y)
      .lineTo(doc.page.width - doc.page.margins.right, doc.y)
      .strokeColor('#333333').lineWidth(1).stroke();
    doc.y += SPACE_PT.afterHeaderRule;

    // --- Questions ----------------------------------------------------------
    paper.questions.forEach((q, qi) => {
      if (qi > 0) doc.y += SPACE_PT.beforeQuestion;
      ensureRoom(doc, 40);
      doc.fontSize(13).font(PDF_FONT_BOLD).fillColor('#000000').text(`Question ${q.number}`, doc.page.margins.left, doc.y);
      doc.y += SPACE_PT.afterQuestionHeading;

      (q.parts ?? []).forEach((part, pi) => {
        if (pi > 0) doc.y += SPACE_PT.afterPart;
        const depth = partDepth(part.label);
        const indent = depth * INDENT_UNIT_PT;

        ensureRoom(doc, Math.min(estimatePartHeight(part, includeMarkScheme, spacing), PAGE_HEIGHT_PT - 2 * PAGE_MARGIN_PT));
        writePartHeaderLine(doc, { label: part.label, commandTerm: part.commandTerm, marks: part.marks, indent });
        doc.y += SPACE_PT.afterPartLabel;

        writeMathText(doc, part.prompt, { fontSize: 11, indent });
        doc.y += SPACE_PT.afterPrompt;

        if (includeMarkScheme) {
          const msIndent = indent + MARK_SCHEME_STYLE.extraIndentPt;
          const barX = doc.page.margins.left + indent + MARK_SCHEME_STYLE.extraIndentPt / 2 - 3;
          const barStartY = doc.y;
          const barStartPage = doc.bufferedPageRange().count - 1;

          ensureRoom(doc, 16);
          writeMathText(doc, 'Mark scheme:', { fontSize: 10, font: PDF_FONT_BOLD, indent: msIndent, color: MARK_SCHEME_STYLE.textColorPdf });
          doc.y += SPACE_PT.afterMarkSchemeHeading;

          if (Array.isArray(part.alternativeMethods)) {
            for (const m of part.alternativeMethods) {
              writeMathText(doc, m.label, { fontSize: 10, font: PDF_FONT_BOLD, indent: msIndent, color: MARK_SCHEME_STYLE.textColorPdf });
              doc.y += SPACE_PT.afterMarkSchemeLine;
              for (const line of m.lines ?? []) {
                writeMathText(doc, `${line.annotation}   ${line.text}`, { fontSize: 10, indent: msIndent, color: MARK_SCHEME_STYLE.textColorPdf });
                doc.y += SPACE_PT.afterMarkSchemeLine;
              }
            }
          } else {
            for (const line of part.markSchemeLines ?? []) {
              writeMathText(doc, `${line.annotation}   ${line.text}`, { fontSize: 10, indent: msIndent, color: MARK_SCHEME_STYLE.textColorPdf });
              doc.y += SPACE_PT.afterMarkSchemeLine;
            }
          }
          if (part.allocationLine) {
            writeMathText(doc, part.allocationLine, { fontSize: 9, font: PDF_FONT_ITALIC, indent: msIndent, color: MARK_SCHEME_STYLE.textColorPdf });
          }
          doc.y += SPACE_PT.afterAllocationLine;

          // Left border bar spanning the whole mark-scheme block, drawn last
          // so the exact end y is known (a thin stroke drawn afterward never
          // obscures the text beside it, unlike a filled background would).
          // barStartY/barEndY are PAGE-LOCAL coordinates — if a page break
          // happened partway through this block (a real, reported bug: a
          // single stroke from the old page's y to the new page's much
          // smaller y drew one long bogus vertical line straight down the
          // new page), draw one segment per page instead: start-page down
          // to its bottom margin, each fully-spanned page top-to-bottom,
          // end-page from its top margin down to the real end y.
          const barEndY = doc.y - SPACE_PT.afterAllocationLine;
          const barEndPage = doc.bufferedPageRange().count - 1;
          const strokeBar = (x0, y0, x1, y1) => doc.moveTo(x0, y0).lineTo(x1, y1)
            .strokeColor(MARK_SCHEME_STYLE.borderColorPdf).lineWidth(MARK_SCHEME_STYLE.borderWidthPt).stroke();
          if (barEndPage === barStartPage) {
            strokeBar(barX, barStartY, barX, barEndY);
          } else {
            const resumePage = barEndPage; // doc is already on this page; restored at the end
            doc.switchToPage(barStartPage);
            strokeBar(barX, barStartY, barX, doc.page.height - doc.page.margins.bottom);
            for (let p = barStartPage + 1; p < barEndPage; p++) {
              doc.switchToPage(p);
              strokeBar(barX, doc.page.margins.top, barX, doc.page.height - doc.page.margins.bottom);
            }
            doc.switchToPage(barEndPage);
            strokeBar(barX, doc.page.margins.top, barX, barEndY);
            doc.switchToPage(resumePage);
          }
        } else if (spacing === 'structured') {
          const lines = linesForMarks(part.marks);
          for (let i = 0; i < lines; i++) {
            ensureRoom(doc, 22);
            const y = doc.y + 18;
            doc.moveTo(doc.page.margins.left + indent, y)
              .lineTo(doc.page.width - doc.page.margins.right, y)
              .strokeColor('#999999').lineWidth(0.5).stroke();
            doc.y = y + 4;
          }
        } else {
          ensureRoom(doc, UNSTRUCTURED_GAP_PT);
          doc.y += UNSTRUCTURED_GAP_PT;
        }
      });

      if (q.totalLine) {
        doc.y += SPACE_PT.afterTotalLine;
        ensureRoom(doc, 14);
        doc.fontSize(10).font(PDF_FONT_ITALIC).text(q.totalLine, doc.page.margins.left, doc.y);
        doc.font(PDF_FONT).fontSize(11);
      }
    });

    doc.end();
  });
}

// --------------------------------------------------------------------------
// Word (.docx)
// --------------------------------------------------------------------------

/** docx's ImageRun transformation width/height are pixels at 96dpi (the OOXML/PowerPoint convention: 1px@96dpi = 9525 EMU) — pt values need this conversion, same 96/72 ratio used nowhere else in this file since pdfkit works natively in points. */
const PT_TO_PX_96DPI = 96 / 72;

/**
 * Every embedded image needs a UNIQUE docPr id — without one, the `docx`
 * package defaults every ImageRun to id="1", which is invalid OOXML and is
 * exactly what caused a real, reported bug: several formulas close together
 * in one sentence (Question 3(a)'s vector notation) rendered detached from
 * the sentence, floating above it, in real Word. Confirmed by inspecting the
 * broken .docx's raw XML — every one of its ~46 embedded images shared
 * docPr id="1". One counter for the whole process (not per-document) is
 * simpler than threading a fresh one through every call and no less
 * correct — global uniqueness is a superset of per-document uniqueness.
 */
const nextImageId = docPropertiesUniqueNumericIdGen();

function emptyRuledParagraph(indentPt = 0) {
  return new Paragraph({
    indent: { left: indentPt * PT_TO_TWIP },
    spacing: { after: 200 },
    border: { bottom: { style: 'single', size: 4, color: '999999' } },
    children: [new TextRun({ text: '', font: DOCX_FONT })],
  });
}

function blankParagraph() {
  return new Paragraph({ spacing: { after: 200 }, children: [new TextRun({ text: '', font: DOCX_FONT })] });
}

/**
 * Build the paragraph list for text that may contain $...$/$$...$$ math (the
 * exact same segmentation as MathText.jsx and the PDF writer's writeMathText
 * above). Returns an ARRAY OF PARAGRAPHS, not just runs: a display-math
 * ($$...$$) segment must be its own centered paragraph — an ImageRun mixed
 * into a left-aligned paragraph is still left-aligned no matter what, since
 * alignment is a paragraph property in OOXML, not a run property (this is
 * the fix for the "display math left-aligned in docx" bug — the old
 * mathTextRuns handed back a flat run list, so every paragraph using it was
 * left-aligned regardless of what it contained). Inline ($...$) math stays
 * mixed into the surrounding paragraph's runs; Word places inline images on
 * the text baseline by default (same convention as an HTML <img>'s default
 * vertical-align), so — unlike the PDF path — no manual baseline math is
 * needed for those.
 *
 * Two passes rather than constructing Paragraphs as segments are found:
 * docx's Paragraph is immutable once built (no supported way to add
 * spacing/border/keepNext after construction), and the LAST paragraph in the
 * list needs properties (trailing spacing, whether it keeps-next) that
 * aren't known until every segment has been seen.
 *
 * @param {string} text
 * @param {{size?:number, italics?:boolean, bold?:boolean, color?:string,
 *          indentPt?:number, border?:object, keepNext?:boolean,
 *          spacingAfterTwips?:number}} [opts]
 *   `size` is in half-points, docx's own unit (22 = 11pt). `indentPt` and
 *   `border` apply to every paragraph returned, including the centered
 *   display-math ones. `keepNext`/`spacingAfterTwips` apply only to the
 *   LAST paragraph — every earlier one always keeps-next, chaining this
 *   text's own wrapped pieces together.
 */
function mathTextParagraphs(text, opts = {}) {
  const {
    size = 22, italics = false, bold = false, color, indentPt = 0,
    border, keepNext = false, spacingAfterTwips = 0,
  } = opts;
  const fontSizePt = size / 2;
  const indent = indentPt ? { left: indentPt * PT_TO_TWIP } : undefined;

  // Pass 1: descriptors (children + whether this piece is a centered
  // display-math block), splitting into a new descriptor at each display
  // segment.
  const descriptors = [];
  let currentRuns = [];
  const flushText = () => {
    if (currentRuns.length > 0) {
      descriptors.push({ children: currentRuns, center: false });
      currentRuns = [];
    }
  };

  for (const seg of segmentsOf(text)) {
    if (seg.type === 'text') {
      // A literal '\n' inside prompt text (a real line break, not a new
      // Word paragraph — matching the PDF writer's writeMathText, which
      // treats \n as a same-block line break too) needs an explicit
      // TextRun `break`; docx does not turn a raw '\n' character in run
      // text into a visible line break on its own.
      seg.value.split('\n').forEach((lineText, li) => {
        if (li === 0 && lineText === '') return;
        currentRuns.push(new TextRun({ text: lineText, italics, bold, size, color, font: DOCX_FONT, break: li > 0 ? 1 : undefined }));
      });
      continue;
    }
    const formula = renderFormula(seg.value, seg.display);
    if (!formula) {
      currentRuns.push(new TextRun({
        text: seg.display ? `$$${seg.value}$$` : `$${seg.value}$`, italics, bold, size, color, font: DOCX_FONT,
      }));
      continue;
    }
    const sizeMultiplier = seg.display ? DISPLAY_MATH_SIZE_MULTIPLIER : 1;
    const heightPt = formula.heightEx * EX_TO_EM * fontSizePt * sizeMultiplier;
    const { buffer, width: pxW, height: pxH } = svgToPng(formula.svg, heightPt * MATH_RASTER_SCALE);
    const widthPt = heightPt * (pxW / pxH);
    const image = new ImageRun({
      type: 'png',
      data: buffer,
      transformation: {
        width: Math.round(widthPt * PT_TO_PX_96DPI),
        height: Math.round(heightPt * PT_TO_PX_96DPI),
      },
      altText: { name: 'formula', description: 'formula', title: 'formula', id: String(nextImageId()) },
    });

    // Same auto-promotion rule as the PDF writer (see
    // INLINE_AUTO_DISPLAY_HEIGHT_RATIO's comment) — an inline formula this
    // tall doesn't fit the remaining space on its text line and gets pushed
    // onto its own line by Word's ordinary inline-image wrapping, visually
    // detaching it from its sentence; promoting it to a real centered block
    // instead is the same fix, applied consistently with the PDF path.
    const autoDisplay = !seg.display && heightPt > INLINE_AUTO_DISPLAY_HEIGHT_RATIO * fontSizePt;
    if (seg.display || autoDisplay) {
      flushText();
      descriptors.push({ children: [image], center: true });
    } else {
      currentRuns.push(image);
    }
  }
  flushText();
  if (descriptors.length === 0) descriptors.push({ children: [new TextRun({ text: '', size, font: DOCX_FONT })], center: false });

  // Pass 2: real Paragraphs, now that the total count (and so which one is
  // last) is known.
  return descriptors.map((d, i) => {
    const isLast = i === descriptors.length - 1;
    return new Paragraph({
      children: d.children,
      alignment: d.center ? AlignmentType.CENTER : undefined,
      indent,
      border,
      keepLines: true,
      keepNext: isLast ? keepNext : true,
      spacing: isLast && spacingAfterTwips ? { after: spacingAfterTwips } : undefined,
    });
  });
}

/**
 * A part's label line — "(a)  [Find]" on the left, "[3]" right-aligned at
 * the page's content-width margin (a right tab stop positioned at the full
 * content width from the page's own margin, per OOXML convention — NOT
 * reduced by this paragraph's own left indent, so it still lands at the true
 * right margin regardless of nesting depth).
 */
function partHeaderParagraph({ label, commandTerm, marks, indentPt, spacingBeforeTwips = 0 }) {
  const leftText = commandTerm ? `${label}  [${commandTerm}]` : label;
  return new Paragraph({
    tabStops: [{ type: TabStopType.RIGHT, position: CONTENT_WIDTH_PT * PT_TO_TWIP }],
    indent: { left: indentPt * PT_TO_TWIP },
    spacing: { before: spacingBeforeTwips, after: SPACE_PT.afterPartLabel * PT_TO_TWIP },
    keepNext: true,
    keepLines: true,
    children: [
      new TextRun({ text: leftText, bold: true, font: DOCX_FONT }),
      new TextRun({ text: `\t[${marks}]`, bold: true, font: DOCX_FONT }),
    ],
  });
}

/** @returns {Promise<Buffer>} */
export async function renderPaperDocx(input, options = {}) {
  const paper = normalize(input);
  const { includeMarkScheme = false, spacing = 'structured', header = {} } = options;

  const children = [];

  // --- Header, centered — mirrors the PDF writer's hierarchy exactly (see
  // renderPaperPdf's header block) rather than relying on docx's built-in
  // Heading styles, which pull their font from the document theme and would
  // silently break the single-font-family goal this whole pass is for. -----
  if (header.schoolName) {
    children.push(new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { after: 80 },
      children: [new TextRun({ text: header.schoolName, bold: true, size: 26, font: DOCX_FONT })],
    }));
  }
  children.push(new Paragraph({
    alignment: AlignmentType.CENTER,
    spacing: { after: 100 },
    children: [new TextRun({ text: paperTitle(paper), bold: true, size: 32, font: DOCX_FONT })],
  }));
  children.push(new Paragraph({
    alignment: AlignmentType.CENTER,
    spacing: { after: header.instructions ? 60 : 0 },
    children: [new TextRun({ text: metaLineParts(header, paper), size: 20, font: DOCX_FONT })],
  }));
  if (header.instructions) {
    children.push(new Paragraph({
      alignment: AlignmentType.CENTER,
      children: [new TextRun({ text: header.instructions, italics: true, size: 20, font: DOCX_FONT })],
    }));
  }
  children.push(new Paragraph({
    border: { bottom: { style: 'single', size: 6, color: '333333' } },
    spacing: { before: 120, after: SPACE_PT.afterHeaderRule * PT_TO_TWIP },
    children: [new TextRun({ text: '', font: DOCX_FONT })],
  }));

  paper.questions.forEach((q, qi) => {
    children.push(new Paragraph({
      spacing: { before: qi > 0 ? SPACE_PT.beforeQuestion * PT_TO_TWIP : 0, after: SPACE_PT.afterQuestionHeading * PT_TO_TWIP },
      keepNext: true,
      children: [new TextRun({ text: `Question ${q.number}`, bold: true, size: 26, font: DOCX_FONT })],
    }));

    (q.parts ?? []).forEach((part, pi) => {
      const depth = partDepth(part.label);
      const indentPt = depth * INDENT_UNIT_PT;

      children.push(partHeaderParagraph({
        label: part.label, commandTerm: part.commandTerm, marks: part.marks, indentPt,
        spacingBeforeTwips: pi > 0 ? SPACE_PT.afterPart * PT_TO_TWIP : 0,
      }));

      children.push(...mathTextParagraphs(part.prompt, {
        indentPt, keepNext: includeMarkScheme, spacingAfterTwips: SPACE_PT.afterPrompt * PT_TO_TWIP,
      }));

      if (includeMarkScheme) {
        const msIndentPt = indentPt + MARK_SCHEME_STYLE.extraIndentPt;
        // OOXML border `size` is in eighths of a point — ×8 matches the PDF
        // writer's borderWidthPt exactly rather than an arbitrary docx value.
        const msBorder = { left: { style: 'single', size: MARK_SCHEME_STYLE.borderWidthPt * 8, color: MARK_SCHEME_STYLE.borderColorDocx, space: 8 } };

        children.push(new Paragraph({
          indent: { left: msIndentPt * PT_TO_TWIP },
          border: msBorder,
          spacing: { after: SPACE_PT.afterMarkSchemeHeading * PT_TO_TWIP },
          keepNext: true,
          keepLines: true,
          children: [new TextRun({ text: 'Mark scheme:', bold: true, size: 20, color: MARK_SCHEME_STYLE.textColorDocx, font: DOCX_FONT })],
        }));

        if (Array.isArray(part.alternativeMethods)) {
          for (const m of part.alternativeMethods) {
            children.push(...mathTextParagraphs(m.label, { size: 20, bold: true, color: MARK_SCHEME_STYLE.textColorDocx, indentPt: msIndentPt, border: msBorder, keepNext: true }));
            for (const line of m.lines ?? []) {
              children.push(...mathTextParagraphs(`${line.annotation}   ${line.text}`, { size: 20, color: MARK_SCHEME_STYLE.textColorDocx, indentPt: msIndentPt, border: msBorder, keepNext: true }));
            }
          }
        } else {
          for (const line of part.markSchemeLines ?? []) {
            children.push(...mathTextParagraphs(`${line.annotation}   ${line.text}`, { size: 20, color: MARK_SCHEME_STYLE.textColorDocx, indentPt: msIndentPt, border: msBorder, keepNext: true }));
          }
        }

        if (part.allocationLine) {
          children.push(...mathTextParagraphs(part.allocationLine, {
            size: 18, italics: true, color: MARK_SCHEME_STYLE.textColorDocx, indentPt: msIndentPt,
            border: msBorder, spacingAfterTwips: SPACE_PT.afterAllocationLine * PT_TO_TWIP,
          }));
        }
      } else if (spacing === 'structured') {
        const lines = linesForMarks(part.marks);
        for (let i = 0; i < lines; i++) children.push(emptyRuledParagraph(indentPt));
      } else {
        children.push(blankParagraph());
        children.push(blankParagraph());
      }
    });

    if (q.totalLine) {
      children.push(new Paragraph({
        spacing: { before: SPACE_PT.afterTotalLine * PT_TO_TWIP, after: 200 },
        children: [new TextRun({ text: q.totalLine, italics: true, size: 20, font: DOCX_FONT })], // 10pt, matches the PDF writer's Total: line size
      }));
    } else {
      children.push(blankParagraph());
    }
  });

  const doc = new Document({
    sections: [{
      properties: {
        page: {
          size: { width: PAGE_WIDTH_PT * PT_TO_TWIP, height: PAGE_HEIGHT_PT * PT_TO_TWIP },
          margin: { top: PAGE_MARGIN_PT * PT_TO_TWIP, bottom: PAGE_MARGIN_PT * PT_TO_TWIP, left: PAGE_MARGIN_PT * PT_TO_TWIP, right: PAGE_MARGIN_PT * PT_TO_TWIP },
        },
      },
      children,
    }],
    styles: { default: { document: { run: { size: 22, font: DOCX_FONT } } } }, // 11pt, matches PDF_FONT's family
  });

  return Packer.toBuffer(doc);
}
