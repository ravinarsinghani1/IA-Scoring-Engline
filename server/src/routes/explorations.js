import { Router } from 'express';
import {
  createExploration,
  getExplorationById,
  listExplorations,
  setCurrentDraftNumber,
} from '../repositories/explorationRepo.js';
import {
  createDraft,
  listDraftsForExploration,
  getMaxDraftNumber,
} from '../repositories/draftRepo.js';
import { wordCount, estimatePageCount } from '../services/textMetrics.js';
import { serializeDraft } from './serializers.js';

const router = Router();

// Create an exploration
router.post('/', async (req, res, next) => {
  try {
    const { studentName, studentId, subject = 'AI', level = 'SL' } = req.body ?? {};
    if (!studentName || !studentName.trim()) {
      return res.status(400).json({ error: 'studentName is required' });
    }
    if (!['SL', 'HL'].includes(level)) {
      return res.status(400).json({ error: "level must be 'SL' or 'HL'" });
    }
    const exploration = await createExploration({
      studentName: studentName.trim(),
      studentId: studentId?.trim() || null,
      subject,
      level,
    });
    res.status(201).json(exploration);
  } catch (err) {
    next(err);
  }
});

// List explorations
router.get('/', async (_req, res, next) => {
  try {
    res.json(await listExplorations());
  } catch (err) {
    next(err);
  }
});

// Get one exploration with its drafts
router.get('/:id', async (req, res, next) => {
  try {
    const exploration = await getExplorationById(req.params.id);
    if (!exploration) return res.status(404).json({ error: 'exploration not found' });
    const drafts = await listDraftsForExploration(exploration.id);
    res.json({ ...exploration, drafts: drafts.map(serializeDraft) });
  } catch (err) {
    next(err);
  }
});

// Submit a draft for an exploration. Auto-increments draft_number and updates
// the exploration's current_draft_number. Scores are stored per draft later.
router.post('/:id/drafts', async (req, res, next) => {
  try {
    const exploration = await getExplorationById(req.params.id);
    if (!exploration) return res.status(404).json({ error: 'exploration not found' });

    const { rawText } = req.body ?? {};
    if (!rawText || !rawText.trim()) {
      return res.status(400).json({ error: 'rawText is required' });
    }

    const nextNumber = (await getMaxDraftNumber(exploration.id)) + 1;
    const draft = await createDraft({
      explorationId: exploration.id,
      draftNumber: nextNumber,
      rawText,
      wordCount: wordCount(rawText),
      pageCount: estimatePageCount(rawText),
    });
    await setCurrentDraftNumber(exploration.id, nextNumber);

    res.status(201).json(serializeDraft(draft));
  } catch (err) {
    next(err);
  }
});

export default router;
