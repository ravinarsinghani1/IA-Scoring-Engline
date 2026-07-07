import { Router } from 'express';
import {
  getDraftById,
  setAuthenticity,
  getPreviousDraft,
} from '../repositories/draftRepo.js';
import { getExplorationById } from '../repositories/explorationRepo.js';
import {
  getScoresForDraft,
  saveScores,
} from '../repositories/criterionScoreRepo.js';
import { serializeDraft, serializeScore } from './serializers.js';
import { parseScore, evaluateGate, gateBlockReason } from '../services/authenticity.js';
import { scoreCriteria } from '../services/scoring/scoreCriteria.js';
import { IMPLEMENTED_CRITERIA } from '../services/scoring/criteria.js';

const router = Router();

// Get a single draft
router.get('/:id', async (req, res, next) => {
  try {
    const draft = await getDraftById(req.params.id);
    if (!draft) return res.status(404).json({ error: 'draft not found' });
    res.json(serializeDraft(draft));
  } catch (err) {
    next(err);
  }
});

// Record the authenticity check for a draft.
// Body: { similarityScore, aiLabelScore } (each 0–100). The gate passes only
// when BOTH are zero (see services/authenticity.js). Manual for the MVP; a real
// similarity/AI-detector integration can replace the inputs later.
router.post('/:id/authenticity', async (req, res, next) => {
  try {
    const draft = await getDraftById(req.params.id);
    if (!draft) return res.status(404).json({ error: 'draft not found' });

    const { similarityScore, aiLabelScore } = req.body ?? {};
    const similarity = parseScore(similarityScore, 'Similarity score');
    const aiLabel = parseScore(aiLabelScore, 'AI-content label');

    const { passed } = evaluateGate({ similarityScore: similarity, aiLabelScore: aiLabel });
    const updated = await setAuthenticity(draft.id, {
      similarityScore: similarity,
      aiLabelScore: aiLabel,
      gatePassed: passed,
    });

    res.json(serializeDraft(updated));
  } catch (err) {
    next(err);
  }
});

// Score a draft. The authenticity gate is a HARD block: scoring is refused with
// 409 until it passes. Once open, the implemented criteria are scored via Claude
// (server-side) and stored per draft.
router.post('/:id/score', async (req, res, next) => {
  try {
    const draft = await getDraftById(req.params.id);
    if (!draft) return res.status(404).json({ error: 'draft not found' });

    const reason = gateBlockReason(draft);
    if (reason) {
      return res.status(409).json({ error: reason, code: 'AUTHENTICITY_GATE' });
    }

    const exploration = await getExplorationById(draft.exploration_id);

    // Score the currently-implemented criteria with Claude.
    const results = await scoreCriteria(IMPLEMENTED_CRITERIA, {
      rawText: draft.raw_text,
      level: exploration.level,
    });

    // Compute "changed since last draft" against the previous draft's scores.
    const prevDraft = await getPreviousDraft(exploration.id, draft.draft_number);
    const prevScores = prevDraft ? await getScoresForDraft(prevDraft.id) : [];

    const saved = await saveScores(draft.id, results, prevScores);
    res.json({ status: 'scored', scores: saved.map(serializeScore) });
  } catch (err) {
    next(err);
  }
});

// Fetch stored scores for a draft (without re-running the model).
router.get('/:id/scores', async (req, res, next) => {
  try {
    const draft = await getDraftById(req.params.id);
    if (!draft) return res.status(404).json({ error: 'draft not found' });
    const scores = await getScoresForDraft(draft.id);
    res.json(scores.map(serializeScore));
  } catch (err) {
    next(err);
  }
});

export default router;
