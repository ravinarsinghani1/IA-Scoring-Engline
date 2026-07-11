// Builds the user-message content for a Claude call about an exploration.
// When a stored PDF is available, the actual PDF is attached (document block
// first) so figures, graphs and equations are seen; otherwise the extracted /
// pasted text is used. Shared by the scorer and the originality coach.

import { readPdfBase64 } from './pdf.js';

// Human-readable IB course label. Criteria A–E are identical across AA and AI;
// the subject only sets the context so "commensurate with the course" is judged
// against the right syllabus.
export function courseLabel(subject, level) {
  const s =
    subject === 'AA'
      ? 'Analysis and Approaches (AA)'
      : 'Applications and Interpretation (AI)';
  return `Mathematics: ${s} ${level}`;
}

// `pdfPath` is a storage object key (set only when the draft was a PDF upload).
// If present, we attach the actual PDF; if the download fails for any reason,
// we fall back to the extracted text rather than failing the whole call.
export async function buildExplorationContent({ pdfPath, rawText, instructions, pdfSuffix }) {
  if (pdfPath) {
    try {
      const data = await readPdfBase64(pdfPath);
      return [
        {
          type: 'document',
          source: { type: 'base64', media_type: 'application/pdf', data },
        },
        { type: 'text', text: `${instructions}\n\n${pdfSuffix}` },
      ];
    } catch (err) {
      console.error('[promptContent] PDF unavailable, falling back to text:', err.message);
    }
  }
  return [
    {
      type: 'text',
      text: `${instructions}

=== STUDENT EXPLORATION TEXT (begins) ===
${rawText}
=== STUDENT EXPLORATION TEXT (ends) ===`,
    },
  ];
}
