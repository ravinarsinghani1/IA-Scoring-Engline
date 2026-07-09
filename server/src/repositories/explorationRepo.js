// Data access for explorations. All methods async so callers `await` them,
// keeping route handlers unchanged when we swap SQLite for an async Postgres
// adapter later.

import { db } from '../db/connection.js';

export async function createExploration({
  studentName,
  studentId = null,
  subject = 'AI',
  level = 'SL',
  folderId = null,
}) {
  const result = await db.run(
    `INSERT INTO exploration (student_name, student_id, subject, level, folder_id)
     VALUES (?, ?, ?, ?, ?)`,
    [studentName, studentId, subject, level, folderId]
  );
  return getExplorationById(result.lastInsertRowid);
}

export async function getExplorationById(id) {
  return db.get(`SELECT * FROM exploration WHERE id = ?`, [id]);
}

// folderFilter: undefined/null → all; a number → that folder; 'none' → ungrouped.
export async function listExplorations(folderFilter) {
  const draftCount = `(SELECT COUNT(*) FROM draft d WHERE d.exploration_id = e.id) AS draft_count`;
  if (folderFilter === 'none') {
    return db.all(
      `SELECT e.*, ${draftCount} FROM exploration e
        WHERE e.folder_id IS NULL ORDER BY e.created_at DESC, e.id DESC`
    );
  }
  if (folderFilter !== undefined && folderFilter !== null && folderFilter !== 'all') {
    return db.all(
      `SELECT e.*, ${draftCount} FROM exploration e
        WHERE e.folder_id = ? ORDER BY e.created_at DESC, e.id DESC`,
      [folderFilter]
    );
  }
  return db.all(
    `SELECT e.*, ${draftCount} FROM exploration e
      ORDER BY e.created_at DESC, e.id DESC`
  );
}

export async function setCurrentDraftNumber(id, draftNumber) {
  await db.run(`UPDATE exploration SET current_draft_number = ? WHERE id = ?`, [
    draftNumber,
    id,
  ]);
  return getExplorationById(id);
}
