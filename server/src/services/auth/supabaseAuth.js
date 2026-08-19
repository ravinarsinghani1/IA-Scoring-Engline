// Verifies a Supabase-issued JWT locally (no network round-trip per request,
// beyond `jose`'s own cached JWKS fetch).
//
// Newer Supabase projects (this one included) sign access tokens with
// asymmetric keys (ES256), not the legacy shared HS256 secret — a static
// SUPABASE_JWT_SECRET + `algorithms: ['HS256']` check rejects every real
// token with ERR_JOSE_ALG_NOT_ALLOWED. Verifying against the project's public
// JWKS endpoint works for either scheme without us needing to know which one
// is in effect, and needs no secret at all.
//
// The important claims for us:
//   sub    -> the user's UUID (matches app_user.id / auth.users.id)
//   email  -> the user's email
//   role   -> Supabase's DB role ('authenticated'), NOT our app role
//
// Our application role (teacher/coordinator/student) lives in app_user, loaded
// separately by requireAuth — never trust an app role from the token.

import { createRemoteJWKSet, jwtVerify } from 'jose';

let cachedJwks = null;

function getJwks() {
  const supabaseUrl = process.env.SUPABASE_URL;
  if (!supabaseUrl) {
    const err = new Error(
      'Auth is not configured: add SUPABASE_URL to server/.env (Supabase dashboard -> Project Settings -> API).'
    );
    err.status = 503;
    err.expose = true;
    throw err;
  }
  if (!cachedJwks) {
    cachedJwks = createRemoteJWKSet(new URL(`${supabaseUrl}/auth/v1/.well-known/jwks.json`));
  }
  return cachedJwks;
}

/**
 * Verify a bearer token string. Throws a 401 error on any failure.
 * @returns {Promise<{ sub: string, email?: string, [k: string]: unknown }>}
 */
export async function verifySupabaseToken(token) {
  try {
    // No `algorithms` restriction: the JWKS itself is the trust anchor
    // (only Supabase's own published keys can produce a valid signature), so
    // we let jose accept whatever algorithm the matching key declares.
    const { payload } = await jwtVerify(token, getJwks(), {
      audience: 'authenticated',
    });
    if (!payload.sub) throw new Error('token missing sub');
    return payload;
  } catch (err) {
    if (err.status === 503) throw err; // config error — surface as-is
    console.error('[auth] JWT verify failed:', err.code || err.name, '-', err.message);
    // TEMP DIAGNOSTIC (2026-08-19) — Render's log dashboard would not surface
    // the line above no matter what we tried, so the real cause is exposed
    // directly in the response instead. REVERT after the auth bug is found —
    // internal error detail should not normally reach API responses.
    const e = new Error(
      `Invalid or expired session. Please sign in again. [DEBUG: ${err.code || err.name || 'unknown'} - ${err.message}]`
    );
    e.status = 401;
    e.expose = true;
    throw e;
  }
}
