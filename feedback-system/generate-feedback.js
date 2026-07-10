#!/usr/bin/env node
// One-page IA topic-feedback generator.
//
// Turns a candidate JSON (see candidates/*.json) into a single-page, editable
// .docx feedback sheet the teacher reviews and forwards to the student.
//
// Usage:
//   node generate-feedback.js <candidate.json> [output.docx]
//
// docx is installed globally; resolve it from the global node_modules.
const { execSync } = require('child_process');
const path = require('path');
const fs = require('fs');

const GLOBAL_MODULES = execSync('npm root -g').toString().trim();
const {
  Document, Packer, Paragraph, TextRun, AlignmentType, BorderStyle, HeadingLevel,
} = require(path.join(GLOBAL_MODULES, 'docx'));

const inputPath = process.argv[2];
if (!inputPath) {
  console.error('Usage: node generate-feedback.js <candidate.json> [output.docx]');
  process.exit(1);
}
const c = JSON.parse(fs.readFileSync(inputPath, 'utf8'));
const outPath =
  process.argv[3] ||
  path.join(path.dirname(inputPath), `${path.basename(inputPath, '.json')}-feedback.docx`);

const BLUE = '2E5A88';
const GREY = '555555';
const rule = (color = BLUE, size = 6) => ({
  bottom: { style: BorderStyle.SINGLE, size, color, space: 2 },
});

// ---- reusable paragraph helpers -------------------------------------------
const sectionHeading = (text) =>
  new Paragraph({
    spacing: { before: 140, after: 40 },
    border: rule(BLUE, 4),
    children: [new TextRun({ text, bold: true, size: 20, color: BLUE, font: 'Arial' })],
  });

const labelBody = (label, body, opts = {}) =>
  new Paragraph({
    numbering: opts.numbered ? { reference: 'nums', level: 0 } : undefined,
    bullet: opts.bullet ? { level: 0 } : undefined,
    spacing: { after: 60 },
    children: [
      label ? new TextRun({ text: `${label} `, bold: true, size: 18, font: 'Arial' }) : null,
      new TextRun({ text: body, size: 18, font: 'Arial' }),
    ].filter(Boolean),
  });

// A checklist line: "A · Presentation:  ☐ item  ☐ item"
const CRIT_NAMES = {
  A: 'Presentation', B: 'Communication', C: 'Personal engagement',
  D: 'Reflection', E: 'Use of mathematics',
};
const checklistLine = (key, items) =>
  new Paragraph({
    spacing: { after: 40 },
    children: [
      new TextRun({ text: `${key} · ${CRIT_NAMES[key]}:  `, bold: true, size: 17, font: 'Arial', color: BLUE }),
      new TextRun({ text: items.map((i) => `☐ ${i}`).join('   '), size: 17, font: 'Arial' }),
    ],
  });

// ---- document --------------------------------------------------------------
const children = [
  new Paragraph({
    spacing: { after: 20 },
    children: [new TextRun({ text: 'IB Mathematics — Internal Assessment', bold: true, size: 26, font: 'Arial' })],
  }),
  new Paragraph({
    border: rule(BLUE, 8),
    spacing: { after: 120 },
    children: [new TextRun({ text: 'Topic Proposal Feedback', size: 22, color: GREY, font: 'Arial' })],
  }),

  new Paragraph({
    spacing: { after: 20 },
    children: [
      new TextRun({ text: 'Candidate: ', bold: true, size: 18, font: 'Arial' }),
      new TextRun({ text: `${c.name}`, size: 18, font: 'Arial' }),
      new TextRun({ text: '     Course: ', bold: true, size: 18, font: 'Arial' }),
      new TextRun({ text: `Mathematics ${c.course} ${c.level}`, size: 18, font: 'Arial' }),
      new TextRun({ text: '     Date: ', bold: true, size: 18, font: 'Arial' }),
      new TextRun({ text: `${c.date}`, size: 18, font: 'Arial' }),
    ],
  }),
  new Paragraph({
    spacing: { after: 60 },
    children: [
      new TextRun({ text: 'Working title: ', bold: true, size: 18, font: 'Arial' }),
      new TextRun({ text: c.title, italics: true, size: 18, font: 'Arial' }),
    ],
  }),
  new Paragraph({
    spacing: { after: 40 },
    shading: { type: 'clear', fill: 'EAF1F8' },
    children: [
      new TextRun({ text: `Verdict: ${c.verdict} — `, bold: true, size: 18, color: BLUE, font: 'Arial' }),
      new TextRun({ text: c.verdictSummary, size: 18, font: 'Arial' }),
    ],
  }),

  sectionHeading("What's working"),
  ...c.strengths.map((s) => labelBody(null, s, { bullet: true })),

  sectionHeading('Priority revisions — do these before you start'),
  ...c.revisions.map((r) => labelBody(r.label, r.text, { numbered: true })),

  sectionHeading('Checklist to a top-band exploration  (tick as you go)'),
  ...['A', 'B', 'C', 'D', 'E'].map((k) => checklistLine(k, c.checklist[k])),

  sectionHeading('Next step'),
  new Paragraph({ children: [new TextRun({ text: c.nextStep, size: 18, font: 'Arial' })] }),
];

const doc = new Document({
  creator: 'IA Topic Feedback System',
  numbering: {
    config: [
      { reference: 'nums', levels: [{ level: 0, format: 'decimal', text: '%1.', alignment: AlignmentType.LEFT, style: { paragraph: { indent: { left: 460, hanging: 320 } } } }] },
    ],
  },
  styles: { default: { document: { run: { font: 'Arial', size: 18 } } } },
  sections: [{
    properties: {
      page: {
        size: { width: 12240, height: 15840 },
        margin: { top: 850, right: 900, bottom: 720, left: 900 },
      },
    },
    children,
  }],
});

Packer.toBuffer(doc).then((buf) => {
  fs.writeFileSync(outPath, buf);
  console.log(`Wrote ${outPath}`);
});
