// Data access for folders (batch/year grouping of explorations).

import { db } from '../db/connection.js';

export async function createFolder(name) {
  const result = await db.run(`INSERT INTO folder (name) VALUES (?)`, [name]);
  return getFolderById(result.lastInsertRowid);
}

export async function getFolderById(id) {
  return db.get(`SELECT * FROM folder WHERE id = ?`, [id]);
}

export async function listFolders() {
  return db.all(
    `SELECT f.*,
            (SELECT COUNT(*) FROM exploration e WHERE e.folder_id = f.id) AS exploration_count
       FROM folder f
      ORDER BY f.created_at DESC, f.id DESC`
  );
}
