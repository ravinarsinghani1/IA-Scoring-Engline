// Verifies a Supabase-issued JWT locally (no network round-trip per request).
//
// Supabase signs access tokens with the project's JWT secret using HS256. We
// verify the signature + standard claims with `jose` and return the decoded
// payload. The important claims for us:
//   sub    -> the user's UUID (matches app_user.id / auth.users.id)
//   email  -> the user's email
//   role   -> Supabase's DB role ('authenticated'), NOT our app role
//
// Our application role (teacher/coordinator/student) lives in app_user, loaded
// separately by requireAuth — never trust an app role from the token.

import { jwtVerify } from 'jose';

let cachedKey = null;

function getKey() {
  const secret = process.env.SUPABASE_JWT_SECRET;
  if (!secret) {
    const err = new Error(
      'Auth is not configured: add SUPABASE_JWT_SECRET to server/.env (Supabase dashboard -> Project Settings -> API -> JWT Settings).'
    );
    err.status = 503;
    err.expose = true;
    throw err;
  }
  if (!cachedKey) cachedKey = new TextEncoder().encode(secret);
  return cachedKey;
}

/**
 * Verify a bearer token string. Throws a 401 error on any failure.
 * @returns {Promise<{ sub: string, email?: string, [k: string]: unknown }>}
 */
export async function verifySupabaseToken(token) {
  try {
    const { payload } = await jwtVerify(token, getKey(), {
      algorithms: ['HS256'],
      // Supabase sets aud to 'authenticated' for signed-in users.
      audience: 'authenticated',
    });
    if (!payload.sub) throw new Error('token missing sub');
    return payload;
  } catch (err) {
    if (err.status === 503) throw err; // config error — surface as-is
    const e = new Error('Invalid or expired session. Please sign in again.');
    e.status = 401;
    e.expose = true;
    throw e;
  }
}
