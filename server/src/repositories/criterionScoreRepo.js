// Data access for per-draft criterion scores. Scores are stored PER DRAFT and
// never overwritten across drafts, so the teacher view can show what changed
// between drafts. Re-scoring the SAME draft replaces that draft's rows.

import { db } from '../db/connection.js';

export async function getScoresForDraft(draftId) {
  return db.all(
    `SELECT * FROM criterion_score WHERE draft_id = ? ORDER BY criterion ASC`,
    [draftId]
  );
}

/**
 * Save scores for a draft. `previousScores` are the prior draft's rows (if any)
 * used to compute changed_since_last_draft. Replaces any existing rows for the
 * same (draft_id, criterion) so re-scoring a draft is idempotent.
 */
export async function saveScores(draftId, results, previousScores = []) {
  const prevByCriterion = new Map(previousScores.map((s) => [s.criterion, s]));

  for (const r of results) {
    const prev = prevByCriterion.get(r.criterion);
    const changed = prev ? prev.engine_mark !== r.engine_mark : false;

    await db.run(
      `INSERT INTO criterion_score
         (draft_id, criterion, engine_mark, max_mark, confidence_tier,
          reasoning_summary, improvement_suggestion, changed_since_last_draft)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(draft_id, criterion) DO UPDATE SET
         engine_mark = excluded.engine_mark,
         max_mark = excluded.max_mark,
         confidence_tier = excluded.confidence_tier,
         reasoning_summary = excluded.reasoning_summary,
         improvement_suggestion = excluded.improvement_suggestion,
         changed_since_last_draft = excluded.changed_since_last_draft`,
      [
        draftId,
        r.criterion,
        r.engine_mark,
        r.max_mark,
        r.confidence_tier,
        r.reasoning_summary,
        r.improvement_suggestion,
        changed ? 1 : 0,
      ]
    );
  }
  return getScoresForDraft(draftId);
}
