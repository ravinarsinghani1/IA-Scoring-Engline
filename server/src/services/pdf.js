// PDF handling: extract text + page count (for word/page metrics and preview),
// and persist the uploaded file to object storage so it can be re-sent to the
// model at scoring time. The ACTUAL PDF — not the extracted text — is what gets
// scored, so figures, graphs and equations are preserved.

import { PDFParse } from 'pdf-parse'; // v2 class-based API
import { uploadPdf, downloadPdfBase64 } from './storage.js';

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

/** Persist a PDF buffer for a draft in object storage; returns its object key. */
export async function savePdf(draftId, buffer) {
  return uploadPdf(`draft_${draftId}.pdf`, buffer);
}

/** Read a stored PDF back as base64 for the Claude document block. */
export async function readPdfBase64(key) {
  return downloadPdfBase64(key);
}
