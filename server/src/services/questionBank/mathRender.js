// Server-side LaTeX -> raster-image rendering for exported PDFs/Word docs.
// Companion to client/src/components/MathText.jsx (identical $...$/$$...$$
// segmentation — duplicated rather than shared, since client and server are
// separate bundles with no module boundary between them, same reasoning as
// CustomQuestionForm.jsx's annotation-marks duplication).
//
// Fixes export.js's long-standing FLAGGED gap: generated content is exported
// as literal LaTeX source ("$\log_2(x)$"), not typeset math. Neither pdfkit
// nor docx's ImageRun can lay out live text, so a formula becomes a small
// raster image placed inline with the surrounding text.
//
// Validated in a standalone PoC first (server/scripts/poc-math-export*.mjs)
// before this file existed. Two things found there that matter here:
//   1. resvg-js defaults to scanning/loading every system font, which cost
//      ~200MB RSS on the very first call for zero benefit — MathJax's SVG
//      output already inlines glyphs as <path> elements, no font lookup is
//      ever needed. Fixed below with font:{loadSystemFonts:false}. Left
//      enabled, this would eat a large slice of Render's 512MB free-tier
//      ceiling for nothing.
//   2. docx's ImageRun needs an explicit `type: 'png'` or Word can't resolve
//      the embedded part's content type (handled by export.js, not here).

import { mathjax } from 'mathjax-full/js/mathjax.js';
import { TeX } from 'mathjax-full/js/input/tex.js';
import { SVG } from 'mathjax-full/js/output/svg.js';
import { liteAdaptor } from 'mathjax-full/js/adaptors/liteAdaptor.js';
import { RegisterHTMLHandler } from 'mathjax-full/js/handlers/html.js';
import { AllPackages } from 'mathjax-full/js/input/tex/AllPackages.js';
import { Resvg } from '@resvg/resvg-js';

// $$...$$ (display) or $...$ (inline), non-greedy, no unescaped '$' inside —
// byte-for-byte the same pattern as MathText.jsx's MATH_RE.
const MATH_RE = /\$\$([^$]+?)\$\$|\$([^$\n]+?)\$/g;

/** Split prose+LaTeX text into alternating text/math segments. */
export function segmentsOf(text) {
  if (typeof text !== 'string' || text === '') return [];
  const parts = [];
  let last = 0;
  let m;
  MATH_RE.lastIndex = 0;
  while ((m = MATH_RE.exec(text)) !== null) {
    if (m.index > last) parts.push({ type: 'text', value: text.slice(last, m.index) });
    if (m[1] !== undefined) parts.push({ type: 'math', value: m[1], display: true });
    else parts.push({ type: 'math', value: m[2], display: false });
    last = MATH_RE.lastIndex;
  }
  if (last < text.length) parts.push({ type: 'text', value: text.slice(last) });
  return parts;
}

/** True when `text` contains no math — callers can skip segment handling entirely. */
export function isPlainText(text) {
  const segs = segmentsOf(text);
  return segs.length <= 1 && (segs.length === 0 || segs[0].type === 'text');
}

// Module-level singleton — MathJax's document/adaptor setup has a real (if
// small) one-time cost; reused across every formula and every request rather
// than rebuilt per call. Created lazily so a server that never exports a
// paper never pays it.
let mathDocument = null;
function getMathDocument() {
  if (!mathDocument) {
    const adaptor = liteAdaptor();
    RegisterHTMLHandler(adaptor);
    const tex = new TeX({ packages: AllPackages });
    // fontCache:'none' — every formula's SVG is fully self-contained (no
    // shared <defs> to track/reuse across separate render calls).
    const svg = new SVG({ fontCache: 'none' });
    mathDocument = { adaptor, doc: mathjax.document('', { InputJax: tex, OutputJax: svg }) };
  }
  return mathDocument;
}

/**
 * Render one LaTeX formula to a self-contained SVG string, plus the
 * declared size MathJax reports for it (width/height in `ex` units, and a
 * `vertical-align` style in ex for baseline placement) — both needed to lay
 * the formula inline with surrounding text.
 * @returns {{svg:string, widthEx:number, heightEx:number, valignEx:number}|null}
 *          null on malformed LaTeX — never throws, so one bad formula can't
 *          fail a whole paper's export; the caller falls back to raw text.
 */
export function renderFormula(latex, display) {
  try {
    const { adaptor, doc } = getMathDocument();
    const node = doc.convert(latex, { display: !!display });
    const svg = adaptor.innerHTML(node);
    const widthMatch = /width="([\d.]+)ex"/.exec(svg);
    const heightMatch = /height="([\d.]+)ex"/.exec(svg);
    const valignMatch = /vertical-align:\s*(-?[\d.]+)ex/.exec(svg);
    if (!widthMatch || !heightMatch) return null;
    return {
      svg,
      widthEx: Number(widthMatch[1]),
      heightEx: Number(heightMatch[1]),
      valignEx: valignMatch ? Number(valignMatch[1]) : 0,
    };
  } catch {
    return null;
  }
}

/**
 * Rasterize an SVG string to a PNG buffer at a given pixel height (width
 * follows automatically, preserving aspect ratio).
 * @returns {{buffer: Buffer, width: number, height: number}}
 */
export function svgToPng(svg, heightPx) {
  const resvg = new Resvg(svg, {
    fitTo: { mode: 'height', value: Math.max(1, Math.round(heightPx)) },
    font: { loadSystemFonts: false }, // see file header — the PoC's ~200MB finding
  });
  const rendered = resvg.render();
  return { buffer: rendered.asPng(), width: rendered.width, height: rendered.height };
}

// MathJax's own TeX x-height metric — empirically confirmed against its SVG
// output's viewBox in the PoC (viewBox units / declared `ex` value ≈ 442,
// i.e. ≈0.431 of MathJax's 1000-unit design em). An approximation, not
// pixel-perfect CSS baseline matching, but sized correctly for print layout.
export const EX_TO_EM = 0.431;
