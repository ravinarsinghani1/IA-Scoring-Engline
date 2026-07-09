import { Router } from 'express';
import { createFolder, listFolders } from '../repositories/folderRepo.js';

const router = Router();

router.get('/', async (_req, res, next) => {
  try {
    res.json(await listFolders());
  } catch (err) {
    next(err);
  }
});

router.post('/', async (req, res, next) => {
  try {
    const { name } = req.body ?? {};
    if (!name || !name.trim()) {
      return res.status(400).json({ error: 'Folder name is required' });
    }
    res.status(201).json(await createFolder(name.trim()));
  } catch (err) {
    next(err);
  }
});

export default router;
