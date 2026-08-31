// Follow-up PoC: does resvg-js's memory jump happen once (library init) or
// per-formula (would blow the budget on a real 20-80 formula paper)? Renders
// N different formulas through the full SVG->PNG path and logs RSS after each.

import { mathjax } from 'mathjax-full/js/mathjax.js';
import { TeX } from 'mathjax-full/js/input/tex.js';
import { SVG } from 'mathjax-full/js/output/svg.js';
import { liteAdaptor } from 'mathjax-full/js/adaptors/liteAdaptor.js';
import { RegisterHTMLHandler } from 'mathjax-full/js/handlers/html.js';
import { AllPackages } from 'mathjax-full/js/input/tex/AllPackages.js';
import { Resvg } from '@resvg/resvg-js';

function mb(bytes) { return (bytes / 1024 / 1024).toFixed(1); }
function snapshot(label) {
  const m = process.memoryUsage();
  console.log(`[mem] ${label.padEnd(20)} rss=${mb(m.rss)}MB heapUsed=${mb(m.heapUsed)}MB external=${mb(m.external)}MB`);
}

const adaptor = liteAdaptor();
RegisterHTMLHandler(adaptor);
const tex = new TeX({ packages: AllPackages });
const svgOutput = new SVG({ fontCache: 'none' });
const mathDocument = mathjax.document('', { InputJax: tex, OutputJax: svgOutput });

snapshot('init');

const FORMULAS = [
  '\\log_2(x(x-2)) = 3', '\\int_0^1 x^2\\,dx', '\\sum_{r=1}^n r(r+1)',
  'y = mx + c', '\\frac{d}{dx}\\left(x^3 - 5x\\right)', '\\sqrt{a^2+b^2}',
  'P(A \\cap B) = P(A)P(B)', '\\binom{n}{r} = \\frac{n!}{r!(n-r)!}',
  '\\lim_{x\\to 0} \\frac{\\sin x}{x}', 'x = \\frac{-b \\pm \\sqrt{b^2-4ac}}{2a}',
  'z = re^{i\\theta}', '\\vec{v} = \\begin{pmatrix}1\\\\2\\\\3\\end{pmatrix}',
  '\\sin^2\\theta + \\cos^2\\theta = 1', 'f(x) = ax^2+bx+c', 'A = \\pi r^2',
  '\\bar{x} = \\frac{\\sum x_i}{n}', 'P(X=k) = \\binom{n}{k}p^k(1-p)^{n-k}',
  '\\log_a b = \\frac{\\ln b}{\\ln a}', 'u_n = u_1 + (n-1)d', 'S_n = \\frac{n}{2}(2a+(n-1)d)',
];

let totalPngBytes = 0;
for (let i = 0; i < FORMULAS.length; i++) {
  const node = mathDocument.convert(FORMULAS[i], { display: false });
  const svgString = adaptor.innerHTML(node);
  const resvg = new Resvg(svgString, { fitTo: { mode: 'width', value: 600 }, background: 'white', font: { loadSystemFonts: false } });
  const png = resvg.render().asPng();
  totalPngBytes += png.length;
  snapshot(`formula ${i + 1}/${FORMULAS.length}`);
}

console.log(`\nTotal PNG bytes across ${FORMULAS.length} formulas: ${(totalPngBytes / 1024).toFixed(1)} KB`);
if (global.gc) {
  global.gc();
  snapshot('after manual gc()');
} else {
  console.log('(run with --expose-gc to also see post-GC RSS)');
}
