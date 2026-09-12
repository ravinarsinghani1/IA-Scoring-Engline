// Verification script for the exam-paper formatting pass — NOT a permanent
// test. Builds a realistic multi-question, multi-topic paper (calculus,
// probability, vectors, sequences — not just the earlier log/exponential
// example) with nested sub-parts, alternative methods, and both inline and
// display math, and renders it with the real export.js.
import fs from 'node:fs';
import path from 'node:path';
import { renderPaperPdf, renderPaperDocx } from '../src/services/questionBank/export.js';

const OUT_DIR = process.argv[2] || '.';

const paper = {
  course: 'AA', level: 'HL', paper: 'P1', totalMarks: 26, questionCount: 4,
  questions: [
    {
      number: 1, calculatorAllowed: false, totalMarks: 7,
      parts: [
        {
          label: '(a)', commandTerm: 'Find', marks: 3,
          prompt: 'Differentiate $f(x) = x^3 - 5x^2 + 2x$ with respect to $x$.',
          markSchemeLines: [
            { annotation: 'M1', text: 'attempt to differentiate term by term' },
            { annotation: 'A1', text: '$f\'(x) = 3x^2 - 10x + 2$' },
          ],
          allocationLine: '[M1 for attempt, A1 for correct derivative — 3 marks]',
        },
        {
          label: '(b)(i)', commandTerm: 'Hence', marks: 2,
          prompt: 'Hence find the gradient of the tangent to the curve $y = f(x)$ at the point where $x = 1$.',
          markSchemeLines: [
            { annotation: 'M1', text: 'substituting $x=1$ into $f\'(x)$' },
            { annotation: 'A1', text: 'gradient $= -5$' },
          ],
          allocationLine: '[M1 for substitution, A1 for gradient — 2 marks]',
        },
        {
          label: '(b)(ii)', commandTerm: 'Find', marks: 2,
          prompt: 'Find the equation of the tangent at this point, giving your answer in the form $y = mx + c$.',
          markSchemeLines: [
            { annotation: 'M1', text: 'using $y - y_1 = m(x-x_1)$ with the point and gradient found' },
            { annotation: 'A1', text: '$y = -5x + 2$' },
          ],
          allocationLine: '[M1 for method, A1 for equation — 2 marks]',
        },
      ],
      totalLine: 'Total: [7 marks]',
    },
    {
      number: 2, calculatorAllowed: true, totalMarks: 6,
      parts: [
        {
          label: '(a)', commandTerm: 'Find', marks: 3,
          prompt: 'A bag contains 5 red and 3 blue balls. Two balls are drawn at random without replacement. Find the probability that both balls are red.',
          markSchemeLines: [
            { annotation: 'M1', text: 'recognising a without-replacement scenario: $\\frac{5}{8} \\times \\frac{4}{7}$' },
            { annotation: 'A1', text: 'correct unsimplified fraction' },
            { annotation: 'A1', text: '$P(\\text{both red}) = \\frac{5}{14}$' },
          ],
          allocationLine: '[M1 for method, A1 for fraction, A1 for final answer — 3 marks]',
        },
        {
          label: '(b)', commandTerm: 'Find', marks: 3,
          prompt: 'Find the probability that at least one ball is blue.',
          markSchemeLines: [
            { annotation: 'M1', text: 'using the complement: $1 - P(\\text{both red})$' },
            { annotation: 'A1', text: 'correct substitution' },
            { annotation: 'A1', text: '$P(\\text{at least one blue}) = \\frac{9}{14}$' },
          ],
          allocationLine: '[M1 for complement approach, A1 for substitution, A1 for answer — 3 marks]',
        },
      ],
      totalLine: 'Total: [6 marks]',
    },
    {
      number: 3, calculatorAllowed: false, totalMarks: 6,
      parts: [
        {
          label: '(a)', commandTerm: 'Show that', marks: 2,
          prompt: 'The position vectors of points $A$ and $B$ relative to the origin $O$ are $\\vec{OA} = \\begin{pmatrix}2\\\\1\\\\-1\\end{pmatrix}$ and $\\vec{OB} = \\begin{pmatrix}4\\\\-1\\\\3\\end{pmatrix}$. Show that $\\vec{AB} = \\begin{pmatrix}2\\\\-2\\\\4\\end{pmatrix}$.',
          markSchemeLines: [
            { annotation: 'M1', text: 'attempt at $\\vec{OB} - \\vec{OA}$' },
            { annotation: 'AG', text: 'given result correctly shown' },
          ],
          allocationLine: '[M1 for attempt, AG — 2 marks]',
        },
        {
          label: '(b)', commandTerm: 'Find', marks: 4,
          prompt: 'Find a vector equation of the line through $A$ and $B$, and hence determine whether the point $(8, -5, 11)$ lies on this line.\n$$\\vec{r} = \\begin{pmatrix}2\\\\1\\\\-1\\end{pmatrix} + \\lambda\\begin{pmatrix}2\\\\-2\\\\4\\end{pmatrix}$$\nUse this to test the given point.',
          alternativeMethods: [
            {
              label: 'METHOD 1',
              lines: [
                { annotation: 'M1', text: 'setting up simultaneous equations for each coordinate' },
                { annotation: 'A1', text: 'solving to find a consistent $\\lambda = 3$' },
                { annotation: 'A1', text: 'the point does lie on the line' },
              ],
            },
            {
              label: 'METHOD 2',
              lines: [
                { annotation: 'M1', text: 'substituting the point directly and solving for $\\lambda$ in each row' },
                { annotation: 'A1', text: 'all three rows give the same $\\lambda$' },
                { annotation: 'A1', text: 'the point does lie on the line' },
              ],
            },
          ],
          allocationLine: '[M1 for method, A1 for consistent parameter, A1 for conclusion — 4 marks]',
        },
      ],
      totalLine: 'Total: [6 marks]',
    },
    {
      number: 4, calculatorAllowed: true, totalMarks: 7,
      parts: [
        {
          label: '(a)', commandTerm: 'Find', marks: 3,
          prompt: 'An arithmetic sequence has first term $u_1 = 5$ and common difference $d = 3$. Find $u_{20}$ and the sum $S_{20}$.\n$$u_n = u_1 + (n-1)d \\qquad S_n = \\frac{n}{2}(2u_1+(n-1)d)$$',
          markSchemeLines: [
            { annotation: 'M1', text: 'substituting into $u_n = u_1+(n-1)d$' },
            { annotation: 'A1', text: '$u_{20} = 62$' },
            { annotation: 'A1', text: '$S_{20} = 670$' },
          ],
          allocationLine: '[M1 for method, A1 for $u_{20}$, A1 for $S_{20}$ — 3 marks]',
        },
        {
          label: '(b)', commandTerm: 'Determine', marks: 4,
          prompt: 'A geometric sequence has the same first term and $u_4 = 40$. Determine the common ratio $r$ and hence $S_{10}$, the sum of the first 10 terms.',
          markSchemeLines: [
            { annotation: 'M1', text: 'setting up $5r^3 = 40$' },
            { annotation: 'A1', text: '$r = 2$' },
            { annotation: 'M1', text: 'substituting into $S_n = \\frac{u_1(r^n-1)}{r-1}$' },
            { annotation: 'A1', text: '$S_{10} = 5115$' },
          ],
          allocationLine: '[M1 for equation, A1 for r, M1 for sum method, A1 for answer — 4 marks]',
        },
      ],
      totalLine: 'Total: [7 marks]',
    },
  ],
};

const header = {
  schoolName: 'Saaryavi School',
  teacherName: 'Ms. Rao',
  className: 'DP2 Mathematics AA HL',
  date: '2026-09-15',
  instructions: 'Answer all questions. Show all working. Unless otherwise stated, non-exact numerical answers should be given correct to three significant figures.',
};

const pdfWithMs = await renderPaperPdf(paper, { includeMarkScheme: true, header });
fs.writeFileSync(path.join(OUT_DIR, 'formatting-with-ms.pdf'), pdfWithMs);
console.log(`Wrote formatting-with-ms.pdf (${pdfWithMs.length} bytes)`);

const docxWithMs = await renderPaperDocx(paper, { includeMarkScheme: true, header });
fs.writeFileSync(path.join(OUT_DIR, 'formatting-with-ms.docx'), docxWithMs);
console.log(`Wrote formatting-with-ms.docx (${docxWithMs.length} bytes)`);

const pdfBlank = await renderPaperPdf(paper, { includeMarkScheme: false, spacing: 'structured', header });
fs.writeFileSync(path.join(OUT_DIR, 'formatting-blank.pdf'), pdfBlank);
console.log(`Wrote formatting-blank.pdf (${pdfBlank.length} bytes) — the actual student-facing paper (no mark scheme)`);

const docxBlank = await renderPaperDocx(paper, { includeMarkScheme: false, spacing: 'structured', header });
fs.writeFileSync(path.join(OUT_DIR, 'formatting-blank.docx'), docxBlank);
console.log(`Wrote formatting-blank.docx (${docxBlank.length} bytes)`);
