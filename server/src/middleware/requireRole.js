// Role guard factory. Built in Phase 0, used from Phase 5 (Coordinator) on.
// Usage: router.get('/whole-school', requireAuth, requireRole('coordinator'), handler)
//
// Assumes requireAuth has already run and set req.user.

export function requireRole(...allowed) {
  return function (req, _res, next) {
    if (!req.user) {
      const err = new Error('Not signed in.');
      err.status = 401;
      err.expose = true;
      return next(err);
    }
    if (!allowed.includes(req.user.role)) {
      const err = new Error('You do not have access to this resource.');
      err.status = 403;
      err.expose = true;
      return next(err);
    }
    next();
  };
}
