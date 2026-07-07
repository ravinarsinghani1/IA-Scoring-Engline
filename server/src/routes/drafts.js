import { Router } from 'express';
import { getDraftById } from '../repositories/draftRepo.js';
import { serializeDraft } from './serializers.js';

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

export default router;
