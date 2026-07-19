// Browser Supabase client — used only for auth (sign in/up/out, session).
// App data still goes through our Express API, never directly to Supabase.

import { createClient } from '@supabase/supabase-js';

const url = import.meta.env.VITE_SUPABASE_URL;
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!url || !anonKey) {
  // Surfaced clearly in dev so a missing client/.env is obvious rather than a
  // cryptic network error later.
  console.error(
    '[auth] Missing VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY. Copy client/.env.example to client/.env and fill them from your Supabase dev project.'
  );
}

// Fallbacks keep createClient from throwing when client/.env is missing, so the
// UI still renders (auth calls will fail clearly rather than white-screening).
export const supabase = createClient(url || 'https://placeholder.supabase.co', anonKey || 'placeholder-anon-key', {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true, // completes the OAuth redirect
  },
});
