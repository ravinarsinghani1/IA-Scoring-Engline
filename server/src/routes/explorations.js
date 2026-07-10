import { Router } from 'express';
import multer from 'multer';
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
  setDraftSourceFilePath,
} from '../repositories/draftRepo.js';
import { wordCount, estimatePageCount } from '../services/textMetrics.js';
import { extractPdf, savePdf } from '../services/pdf.js';
import { serializeDraft } from './serializers.js';

const router = Router();

// PDF uploads held in memory (Claude's limit is 32 MB / request). Reject
// anything that isn't a PDF.
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 32 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    if (file.mimetype === 'application/pdf') return cb(null, true);
    const err = new Error('Only PDF files are supported. For Word, save as PDF first.');
    err.status = 400;
    err.expose = true;
    cb(err);
  },
});

// Create an exploration
router.post('/', async (req, res, next) => {
  try {
    const { studentName, studentId, subject = 'AI', level = 'SL', folderId } = req.body ?? {};
    if (!studentName || !studentName.trim()) {
      return res.status(400).json({ error: 'studentName is required' });
    }
    if (!['SL', 'HL'].includes(level)) {
      return res.status(400).json({ error: "level must be 'SL' or 'HL'" });
    }
    if (!['AI', 'AA'].includes(subject)) {
      return res.status(400).json({ error: "subject must be 'AI' or 'AA'" });
    }
    const exploration = await createExploration({
      studentName: studentName.trim(),
      studentId: studentId?.trim() || null,
      subject,
      level,
      folderId: folderId ?? null,
    });
    res.status(201).json(exploration);
  } catch (err) {
    next(err);
  }
});

// List explorations, optionally filtered by folder (?folderId=N | none | all)
router.get('/', async (req, res, next) => {
  try {
    res.json(await listExplorations(req.query.folderId));
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

// Submit a draft for an exploration. Accepts EITHER a pasted-text body
// (application/json { rawText }) OR a PDF upload (multipart form-data, field
// "file"). Auto-increments draft_number and updates current_draft_number.
// For a PDF, the file is stored and its text extracted for metrics/preview — but
// the original PDF is what gets sent to the model at scoring time.
router.post('/:id/drafts', upload.single('file'), async (req, res, next) => {
  try {
    const exploration = await getExplorationById(req.params.id);
    if (!exploration) return res.status(404).json({ error: 'exploration not found' });

    const nextNumber = (await getMaxDraftNumber(exploration.id)) + 1;
    let draft;

    if (req.file) {
      // --- PDF upload path ---
      const { text, pageCount } = await extractPdf(req.file.buffer);
      draft = await createDraft({
        explorationId: exploration.id,
        draftNumber: nextNumber,
        rawText: text, // extracted text: metrics + preview only
        wordCount: wordCount(text),
        pageCount: pageCount || estimatePageCount(text),
        sourceKind: 'pdf',
        sourceFileName: req.file.originalname,
      });
      const filePath = savePdf(draft.id, req.file.buffer);
      draft = await setDraftSourceFilePath(draft.id, filePath);
    } else {
      // --- Pasted-text path ---
      const { rawText } = req.body ?? {};
      if (!rawText || !rawText.trim()) {
        return res.status(400).json({ error: 'Provide pasted text or upload a PDF.' });
      }
      draft = await createDraft({
        explorationId: exploration.id,
        draftNumber: nextNumber,
        rawText,
        wordCount: wordCount(rawText),
        pageCount: estimatePageCount(rawText),
        sourceKind: 'text',
      });
    }

    await setCurrentDraftNumber(exploration.id, nextNumber);
    res.status(201).json(serializeDraft(draft));
  } catch (err) {
    next(err);
  }
});

export default router;
