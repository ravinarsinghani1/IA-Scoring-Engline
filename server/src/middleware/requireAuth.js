// Express middleware: authenticate a request via its Supabase JWT.
//
// Attaches:
//   req.auth = { sub, email, ... }  the verified token claims (always present
//                                   on success, even before a profile exists)
//   req.user = app_user row | null  our application profile (null until the
//                                   client has called /api/auth/bootstrap)
//
// Data routes should require req.user (a completed profile). The auth routes
// (/me, /bootstrap) accept a valid token with req.user still null.

import { verifySupabaseToken } from '../services/auth/supabaseAuth.js';
import { userRepo } from '../repositories/userRepo.js';

function bearer(req) {
  const h = req.headers.authorization || '';
  const [scheme, token] = h.split(' ');
  return scheme === 'Bearer' && token ? token : null;
}

export async function requireAuth(req, _res, next) {
  try {
    const token = bearer(req);
    if (!token) {
      const err = new Error('Not signed in.');
      err.status = 401;
      err.expose = true;
      throw err;
    }
    const claims = await verifySupabaseToken(token);
    req.auth = claims;
    req.user = (await userRepo.getById(claims.sub)) || null;
    next();
  } catch (err) {
    next(err);
  }
}

/** Stricter guard for data routes: a completed profile is required. */
export async function requireProfile(req, _res, next) {
  if (!req.user) {
    const err = new Error('Profile not set up. Complete sign-in first.');
    err.status = 403;
    err.expose = true;
    return next(err);
  }
  next();
}
