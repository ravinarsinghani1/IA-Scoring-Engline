// Builds the user-message content for a Claude call about an exploration.
// When a stored PDF is available, the actual PDF is attached (document block
// first) so figures, graphs and equations are seen; otherwise the extracted /
// pasted text is used. Shared by the scorer and the originality coach.

import fs from 'node:fs';
import { readPdfBase64 } from './pdf.js';

export function buildExplorationContent({ pdfPath, rawText, instructions, pdfSuffix }) {
  const hasPdf = pdfPath && fs.existsSync(pdfPath);
  if (hasPdf) {
    return [
      {
        type: 'document',
        source: { type: 'base64', media_type: 'application/pdf', data: readPdfBase64(pdfPath) },
      },
      { type: 'text', text: `${instructions}\n\n${pdfSuffix}` },
    ];
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
