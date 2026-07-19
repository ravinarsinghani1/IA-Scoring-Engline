// Data-access for app_user (profile keyed to a Supabase auth.users UUID).

import { db } from '../db/connection.js';

export const userRepo = {
  async getById(id) {
    return db.get('SELECT * FROM app_user WHERE id = ?', [id]);
  },

  async getByEmail(email) {
    return db.get('SELECT * FROM app_user WHERE email = ?', [String(email).toLowerCase()]);
  },

  /**
   * Create the profile row for a freshly-authenticated Supabase user if it does
   * not already exist. Idempotent: on conflict, keep the existing row (only
   * refresh email/full_name from the identity provider). Role is NOT set here —
   * that happens in the Role Picker via setRoleAndSubjects.
   */
  async upsertFromAuth({ id, email, fullName, schoolId }) {
    await db.run(
      `INSERT INTO app_user (id, email, full_name, school_id)
       VALUES (?, ?, ?, ?)
       ON CONFLICT (id) DO UPDATE
         SET email = EXCLUDED.email,
             full_name = COALESCE(EXCLUDED.full_name, app_user.full_name),
             school_id = COALESCE(app_user.school_id, EXCLUDED.school_id)`,
      [id, String(email).toLowerCase(), fullName ?? null, schoolId ?? null]
    );
    return this.getById(id);
  },

  /** Role Picker submit: set role + subject assignments and mark confirmed. */
  async setRoleAndSubjects(id, { role, subjects }) {
    await db.run(
      `UPDATE app_user
         SET role = ?, subjects = ?, role_confirmed = 1
       WHERE id = ?`,
      [role, subjects ? JSON.stringify(subjects) : null, id]
    );
    return this.getById(id);
  },
};
