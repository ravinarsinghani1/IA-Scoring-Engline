// PROOF-OF-CONCEPT — not wired into export.js yet. Run manually:
//   node server/scripts/poc-math-export.mjs
//
// Validates the proposed fix for export.js's FLAGGED "raw LaTeX text" gap:
// render one formula to SVG with MathJax (no browser, no DOM shim — its
// `liteAdaptor` is pure JS), draw that SVG straight into a PDF with
// svg-to-pdfkit, and rasterize it to PNG with @resvg/resvg-js (pure Rust/WASM,
// no system Cairo/Chromium dependency) for the Word/.docx path, since `docx`'s
// ImageRun needs a raster, not SVG. Also samples process memory before/after
// so the 512MB Render free-tier ceiling can be checked against something real
// rather than assumed.

import { mathjax } from 'mathjax-full/js/mathjax.js';
import { TeX } from 'mathjax-full/js/input/tex.js';
import { SVG } from 'mathjax-full/js/output/svg.js';
import { liteAdaptor } from 'mathjax-full/js/adaptors/liteAdaptor.js';
import { RegisterHTMLHandler } from 'mathjax-full/js/handlers/html.js';
import { AllPackages } from 'mathjax-full/js/input/tex/AllPackages.js';

import PDFDocument from 'pdfkit';
import SVGtoPDF from 'svg-to-pdfkit';
import { Resvg } from '@resvg/resvg-js';
import { Document, Packer, Paragraph, ImageRun } from 'docx';
import fs from 'node:fs';
import path from 'node:path';

const OUT_DIR = process.argv[2] || '.';

function mb(bytes) {
  return (bytes / 1024 / 1024).toFixed(1);
}
function snapshot(label) {
  const m = process.memoryUsage();
  console.log(`[mem] ${label.padEnd(28)} rss=${mb(m.rss)}MB heapUsed=${mb(m.heapUsed)}MB external=${mb(m.external)}MB`);
}

snapshot('start');

// --- Step 1: LaTeX -> SVG via MathJax (no browser involved) ----------------
const adaptor = liteAdaptor();
RegisterHTMLHandler(adaptor);
const tex = new TeX({ packages: AllPackages });
const svgOutput = new SVG({ fontCache: 'none' }); // 'none' = self-contained SVG per formula, no shared <defs> to manage across calls
const mathDocument = mathjax.document('', { InputJax: tex, OutputJax: svgOutput });

snapshot('after MathJax init');

// The exact formula from the live Case-4 smoke test / this session's fixture:
// a sum with bounds and a log, representative of what generate.js produces.
const FORMULA = '\\log_2(x(x-2)) = 3';

const node = mathDocument.convert(FORMULA, { display: false });
const svgString = adaptor.innerHTML(node);
fs.writeFileSync(path.join(OUT_DIR, 'formula.svg'), svgString);
console.log(`\nSVG length: ${svgString.length} chars`);
console.log(`SVG preview: ${svgString.slice(0, 200)}...\n`);

snapshot('after SVG conversion');

// --- Step 2: SVG -> PDF (pdfkit, via svg-to-pdfkit) -------------------------
const pdfDoc = new PDFDocument({ margin: 50 });
const pdfChunks = [];
pdfDoc.on('data', (c) => pdfChunks.push(c));
const pdfDone = new Promise((resolve) => pdfDoc.on('end', resolve));

pdfDoc.fontSize(14).text('PoC: MathJax SVG rendered into a pdfkit PDF', { underline: true });
pdfDoc.moveDown();
pdfDoc.fontSize(11).text('Formula source: ' + FORMULA);
pdfDoc.moveDown();
// SVGtoPDF draws at the current pdfDoc.x/.y; scale up a bit since MathJax's
// default ex-based units render tiny at 1:1.
SVGtoPDF(pdfDoc, svgString, pdfDoc.x, pdfDoc.y, { width: 300 });
pdfDoc.end();
await pdfDone;
fs.writeFileSync(path.join(OUT_DIR, 'poc.pdf'), Buffer.concat(pdfChunks));
console.log('Wrote poc.pdf');

snapshot('after PDF render');

// --- Step 3: SVG -> PNG (resvg-js, pure Rust/WASM) --------------------------
// loadSystemFonts:false is the fix found in the follow-up loop PoC — resvg
// defaults to scanning/loading every system font (for text-shaping fallback),
// which cost ~200MB RSS on the very first call. MathJax's SVG output already
// inlines glyphs as <path> elements (fontCache:'none'), so no font lookup is
// ever needed; disabling it drops the fixed cost to ~20MB.
const resvg = new Resvg(svgString, {
  fitTo: { mode: 'width', value: 600 },
  background: 'white',
  font: { loadSystemFonts: false },
});
const pngBuffer = resvg.render().asPng();
fs.writeFileSync(path.join(OUT_DIR, 'formula.png'), pngBuffer);
console.log(`Wrote formula.png (${(pngBuffer.length / 1024).toFixed(1)} KB)`);

snapshot('after PNG rasterization');

// --- Step 4: PNG -> Word (.docx), since docx's ImageRun needs a raster ------
const docxDoc = new Document({
  sections: [{
    properties: {},
    children: [
      new Paragraph({ text: 'PoC: MathJax formula rasterized into a Word document' }),
      new Paragraph({ text: 'Formula source: ' + FORMULA }),
      new Paragraph({
        children: [new ImageRun({ type: 'png', data: pngBuffer, transformation: { width: 220, height: 60 } })],
      }),
    ],
  }],
});
const docxBuffer = await Packer.toBuffer(docxDoc);
fs.writeFileSync(path.join(OUT_DIR, 'poc.docx'), docxBuffer);
console.log('Wrote poc.docx');

snapshot('after DOCX build');

console.log('\nDone. Peak RSS above is the number to compare against the 512MB Render ceiling.');
