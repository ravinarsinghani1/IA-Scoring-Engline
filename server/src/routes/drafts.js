import { Router } from 'express';
import { getDraftById, setAuthenticity } from '../repositories/draftRepo.js';
import { serializeDraft } from './serializers.js';
import { parseScore, evaluateGate, gateBlockReason } from '../services/authenticity.js';

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

// Score a draft. Placeholder until Step 3 — but the HARD GATE is enforced here
// for real now: scoring is refused with 409 until the authenticity gate passes.
router.post('/:id/score', async (req, res, next) => {
  try {
    const draft = await getDraftById(req.params.id);
    if (!draft) return res.status(404).json({ error: 'draft not found' });

    const reason = gateBlockReason(draft);
    if (reason) {
      return res.status(409).json({ error: reason, code: 'AUTHENTICITY_GATE' });
    }

    // Gate passed — real per-criterion scoring arrives in Step 3+.
    res.json({
      status: 'gate_passed',
      message: 'Authenticity gate passed. Scoring engine is implemented from Step 3 onward.',
    });
  } catch (err) {
    next(err);
  }
});

export default router;
