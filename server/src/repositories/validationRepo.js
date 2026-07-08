// Data access for validation records (engine vs teacher/IB marks).

import { db } from '../db/connection.js';

export async function getValidationForExploration(explorationId) {
  return db.all(
    `SELECT * FROM validation_record WHERE exploration_id = ? ORDER BY criterion ASC`,
    [explorationId]
  );
}

export async function getAllValidations() {
  return db.all(
    `SELECT v.*, e.student_name, e.level
       FROM validation_record v
       JOIN exploration e ON e.id = v.exploration_id
      ORDER BY e.student_name ASC, v.criterion ASC`
  );
}

/** Distinct explorations that have any validation recorded. */
export async function listValidatedExplorations() {
  return db.all(
    `SELECT e.id, e.student_name, e.level,
            (SELECT MAX(draft_id) FROM validation_record v WHERE v.exploration_id = e.id) AS draft_id
       FROM exploration e
      WHERE EXISTS (SELECT 1 FROM validation_record v WHERE v.exploration_id = e.id)
      ORDER BY e.student_name ASC`
  );
}

/** Replace all validation rows for an exploration with a fresh comparison. */
export async function saveValidation(explorationId, draftId, comparisons) {
  await db.run(`DELETE FROM validation_record WHERE exploration_id = ?`, [explorationId]);
  for (const c of comparisons) {
    await db.run(
      `INSERT INTO validation_record
         (exploration_id, draft_id, criterion, engine_mark, engine_range_low,
          engine_range_high, teacher_mark, ib_moderated_mark, agreement_delta)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        explorationId,
        draftId,
        c.criterion,
        c.engine_mark,
        c.engine_range_low,
        c.engine_range_high,
        c.teacher_mark,
        c.ib_moderated_mark,
        c.agreement_delta,
      ]
    );
  }
  return getValidationForExploration(explorationId);
}
