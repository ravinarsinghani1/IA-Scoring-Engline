import { Router } from 'express';
import { getExplorationById } from '../repositories/explorationRepo.js';
import {
  getDraftById,
  getLatestDraft,
  getPreviousDraft,
} from '../repositories/draftRepo.js';
import { getScoresForDraft, saveScores } from '../repositories/criterionScoreRepo.js';
import {
  saveValidation,
  getValidationForExploration,
  getAllValidations,
} from '../repositories/validationRepo.js';
import { scoreCriteria } from '../services/scoring/scoreCriteria.js';
import { CRITERIA, IMPLEMENTED_CRITERIA } from '../services/scoring/criteria.js';
import { computeComparison, summarize } from '../services/validation.js';

const router = Router();

// Validate an exploration against known teacher (and optional IB) marks. Scores
// the draft if it hasn't been scored yet (validation is a testing context, so it
// is NOT blocked by the authenticity gate). Body:
//   { draftId?, teacherMarks: {A,B,C,D,E}, ibMarks?: {A,B,C,D,E} }
router.post('/explorations/:id', async (req, res, next) => {
  try {
    const exploration = await getExplorationById(req.params.id);
    if (!exploration) return res.status(404).json({ error: 'exploration not found' });

    const { draftId, teacherMarks = {}, ibMarks = {} } = req.body ?? {};
    const draft = draftId ? await getDraftById(draftId) : await getLatestDraft(exploration.id);
    if (!draft) return res.status(400).json({ error: 'This exploration has no draft to validate.' });

    // Validate supplied marks are within each criterion's range.
    for (const [k, v] of [...Object.entries(teacherMarks), ...Object.entries(ibMarks)]) {
      if (v === '' || v === null || v === undefined) continue;
      const max = CRITERIA[k]?.maxMark;
      const n = Number(v);
      if (max === undefined || !Number.isInteger(n) || n < 0 || n > max) {
        return res.status(400).json({ error: `Mark for criterion ${k} must be a whole number 0–${max ?? '?'}.` });
      }
    }

    // Ensure engine scores exist for this draft (score once if missing).
    let scores = await getScoresForDraft(draft.id);
    if (!scores.length) {
      const results = await scoreCriteria(IMPLEMENTED_CRITERIA, {
        rawText: draft.raw_text,
        level: exploration.level,
        subject: exploration.subject,
        pdfPath: draft.source_kind === 'pdf' ? draft.source_file_path : null,
      });
      const prev = await getPreviousDraft(exploration.id, draft.draft_number);
      const prevScores = prev ? await getScoresForDraft(prev.id) : [];
      scores = await saveScores(draft.id, results, prevScores);
    }

    const comparisons = computeComparison(scores, teacherMarks, ibMarks);
    await saveValidation(exploration.id, draft.id, comparisons);
    res.json({ draftId: draft.id, comparisons });
  } catch (err) {
    next(err);
  }
});

// Stored validation for one exploration.
router.get('/explorations/:id', async (req, res, next) => {
  try {
    res.json(await getValidationForExploration(req.params.id));
  } catch (err) {
    next(err);
  }
});

// Aggregate across all validated explorations: per-criterion agreement stats
// plus the per-exploration breakdown.
router.get('/summary', async (_req, res, next) => {
  try {
    const rows = await getAllValidations();
    const perCriterion = summarize(rows);

    const byExploration = new Map();
    for (const r of rows) {
      if (!byExploration.has(r.exploration_id)) {
        byExploration.set(r.exploration_id, {
          exploration_id: r.exploration_id,
          student_name: r.student_name,
          level: r.level,
          rows: [],
        });
      }
      byExploration.get(r.exploration_id).rows.push(r);
    }

    res.json({ perCriterion, explorations: [...byExploration.values()] });
  } catch (err) {
    next(err);
  }
});

export default router;
