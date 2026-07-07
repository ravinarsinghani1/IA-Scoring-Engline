// Data access for explorations. All methods async so callers `await` them,
// keeping route handlers unchanged when we swap SQLite for an async Postgres
// adapter later.

import { db } from '../db/connection.js';

export async function createExploration({ studentName, studentId = null, subject = 'AI', level = 'SL' }) {
  const result = await db.run(
    `INSERT INTO exploration (student_name, student_id, subject, level)
     VALUES (?, ?, ?, ?)`,
    [studentName, studentId, subject, level]
  );
  return getExplorationById(result.lastInsertRowid);
}

export async function getExplorationById(id) {
  return db.get(`SELECT * FROM exploration WHERE id = ?`, [id]);
}

export async function listExplorations() {
  return db.all(
    `SELECT e.*,
            (SELECT COUNT(*) FROM draft d WHERE d.exploration_id = e.id) AS draft_count
       FROM exploration e
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
