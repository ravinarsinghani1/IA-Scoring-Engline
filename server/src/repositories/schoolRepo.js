// Data-access for schools (tenant boundary; registration is domain-locked).

import { db } from '../db/connection.js';

export const schoolRepo = {
  async getById(id) {
    return db.get('SELECT * FROM school WHERE id = ?', [id]);
  },

  /** Look up a school by its registered email domain (lowercased). */
  async getByDomain(domain) {
    return db.get('SELECT * FROM school WHERE domain = ?', [String(domain).toLowerCase()]);
  },
};
