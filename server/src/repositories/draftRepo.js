// Data access for drafts. Scores are kept PER DRAFT (never overwritten) so the
// teacher view can compute "changed since last draft".

import { db } from '../db/connection.js';

export async function createDraft({
  explorationId,
  draftNumber,
  rawText,
  extractedMathContent = null,
  wordCount = 0,
  pageCount = 0,
  sourceKind = 'text',
  sourceFileName = null,
}) {
  const result = await db.run(
    `INSERT INTO draft
       (exploration_id, draft_number, raw_text, extracted_math_content, word_count,
        page_count, source_kind, source_file_name)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      explorationId,
      draftNumber,
      rawText,
      extractedMathContent,
      wordCount,
      pageCount,
      sourceKind,
      sourceFileName,
    ]
  );
  return getDraftById(result.lastInsertRowid);
}

// Records where the uploaded source file was saved (known only after the draft
// row exists, since the filename is keyed by draft id).
export async function setDraftSourceFilePath(draftId, filePath) {
  await db.run(`UPDATE draft SET source_file_path = ? WHERE id = ?`, [filePath, draftId]);
  return getDraftById(draftId);
}

export async function getDraftById(id) {
  return db.get(`SELECT * FROM draft WHERE id = ?`, [id]);
}

export async function listDraftsForExploration(explorationId) {
  return db.all(
    `SELECT * FROM draft WHERE exploration_id = ? ORDER BY draft_number ASC`,
    [explorationId]
  );
}

export async function getLatestDraft(explorationId) {
  return db.get(
    `SELECT * FROM draft WHERE exploration_id = ?
      ORDER BY draft_number DESC LIMIT 1`,
    [explorationId]
  );
}

export async function getMaxDraftNumber(explorationId) {
  const row = await db.get(
    `SELECT MAX(draft_number) AS max FROM draft WHERE exploration_id = ?`,
    [explorationId]
  );
  return row?.max ?? 0;
}

// The draft immediately before `draftNumber` in the same exploration (the
// highest-numbered draft below it), used to compute "changed since last draft".
export async function getPreviousDraft(explorationId, draftNumber) {
  return db.get(
    `SELECT * FROM draft
      WHERE exploration_id = ? AND draft_number < ?
      ORDER BY draft_number DESC LIMIT 1`,
    [explorationId, draftNumber]
  );
}

// --- Authenticity gate (Step 2 will drive these; columns exist now) ---

export async function setAuthenticity(draftId, { similarityScore, aiLabelScore, gatePassed }) {
  await db.run(
    `UPDATE draft
        SET authenticity_similarity_score = ?,
            authenticity_ai_label_score   = ?,
            authenticity_gate_passed      = ?
      WHERE id = ?`,
    [similarityScore, aiLabelScore, gatePassed ? 1 : 0, draftId]
  );
  return getDraftById(draftId);
}
