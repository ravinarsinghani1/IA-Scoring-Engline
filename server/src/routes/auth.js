// Auth routes. All require a valid Supabase JWT (requireAuth), but tolerate a
// not-yet-created profile (req.user may be null) so a brand-new user can
// bootstrap and pick a role.
//
//   GET  /api/auth/me        -> current profile (or { profile: null })
//   POST /api/auth/bootstrap -> create/refresh profile; enforce school domain
//   POST /api/auth/role      -> Role Picker submit (role + subjects)

import { Router } from 'express';
import { requireAuth } from '../middleware/requireAuth.js';
import { userRepo } from '../repositories/userRepo.js';
import { schoolRepo } from '../repositories/schoolRepo.js';

const router = Router();

const VALID_ROLES = ['teacher', 'coordinator'];       // Student is provisioned by a coordinator, not self-selected
const VALID_SUBJECTS = ['math_aa', 'math_ai'];        // others "coming soon" per spec

// Shape a raw app_user row into the JSON the client expects.
function serializeUser(row) {
  if (!row) return null;
  return {
    id: row.id,
    email: row.email,
    fullName: row.full_name,
    schoolId: row.school_id,
    role: row.role,
    roleConfirmed: row.role_confirmed === 1,
    subjects: row.subjects ? JSON.parse(row.subjects) : [],
  };
}

function domainOf(email) {
  // Use everything after the LAST '@' (robust to unusual local-parts), not
  // split('@')[1], which would take the wrong segment for a multi-'@' address.
  const s = String(email || '').toLowerCase();
  const at = s.lastIndexOf('@');
  return at === -1 ? '' : s.slice(at + 1);
}

router.get('/me', requireAuth, (req, res) => {
  res.json({ profile: serializeUser(req.user) });
});

// Called by the client right after a successful Supabase sign-in. Creates the
// app_user profile if missing, after verifying the email domain matches a
// registered school (school-domain-locked registration, per spec).
router.post('/bootstrap', requireAuth, async (req, res, next) => {
  try {
    const email = req.auth.email;
    if (!email) {
      const err = new Error('Your account has no email; cannot verify school.');
      err.status = 400;
      err.expose = true;
      throw err;
    }

    // If a profile already exists, just return it (idempotent).
    let existing = req.user || (await userRepo.getById(req.auth.sub));
    if (existing) {
      return res.json({ profile: serializeUser(existing), needsRolePicker: existing.role_confirmed !== 1 });
    }

    const school = await schoolRepo.getByDomain(domainOf(email));
    if (!school) {
      const err = new Error(
        "This email's domain isn't registered to a school on Saaryavi. Contact your coordinator or use your school Google Workspace account."
      );
      err.status = 403;
      err.expose = true;
      throw err;
    }

    const fullName = req.auth.user_metadata?.full_name || req.auth.name || null;
    const created = await userRepo.upsertFromAuth({
      id: req.auth.sub,
      email,
      fullName,
      schoolId: school.id,
    });
    res.status(201).json({ profile: serializeUser(created), needsRolePicker: true });
  } catch (err) {
    next(err);
  }
});

// Role Picker submit. Teacher or Coordinator + subject assignment checkboxes.
router.post('/role', requireAuth, async (req, res, next) => {
  try {
    if (!req.user) {
      const err = new Error('Complete sign-in before choosing a role.');
      err.status = 403;
      err.expose = true;
      throw err;
    }
    const { role, subjects } = req.body || {};
    if (!VALID_ROLES.includes(role)) {
      const err = new Error('Choose a role: Teacher or Coordinator.');
      err.status = 400;
      err.expose = true;
      throw err;
    }
    const cleanSubjects = Array.isArray(subjects)
      ? subjects.filter((s) => VALID_SUBJECTS.includes(s))
      : [];

    const updated = await userRepo.setRoleAndSubjects(req.user.id, { role, subjects: cleanSubjects });
    res.json({ profile: serializeUser(updated) });
  } catch (err) {
    next(err);
  }
});

export default router;
