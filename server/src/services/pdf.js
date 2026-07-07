// PDF handling: extract text + page count (for word/page metrics and preview),
// and persist the uploaded file so it can be re-sent to the model at scoring
// time. The ACTUAL PDF — not the extracted text — is what gets scored, so
// figures, graphs and equations are preserved.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { PDFParse } from 'pdf-parse'; // v2 class-based API

const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const UPLOADS_DIR = path.join(__dirname, '..', '..', 'data', 'uploads');

fs.mkdirSync(UPLOADS_DIR, { recursive: true });

/** Best-effort text + page count from a PDF buffer. Never throws. */
export async function extractPdf(buffer) {
  try {
    const parser = new PDFParse({ data: buffer });
    const result = await parser.getText();
    return { text: (result.text || '').trim(), pageCount: result.total || 0 };
  } catch {
    return { text: '', pageCount: 0 };
  }
}

/** Persist a PDF buffer for a draft; returns the absolute file path. */
export function savePdf(draftId, buffer) {
  const filePath = path.join(UPLOADS_DIR, `draft_${draftId}.pdf`);
  fs.writeFileSync(filePath, buffer);
  return filePath;
}

/** Read a stored PDF back as a base64 string for the Claude document block. */
export function readPdfBase64(filePath) {
  return fs.readFileSync(filePath).toString('base64');
}
