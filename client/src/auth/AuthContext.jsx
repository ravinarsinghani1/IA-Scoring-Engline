// Auth context: owns the Supabase session + our app_user profile, and exposes
// sign-in/out helpers. Also wires api.js so every backend request carries the
// current access token.

import { createContext, useContext, useEffect, useState, useCallback } from 'react';
import { supabase } from '../lib/supabaseClient.js';
import { api, setAccessTokenGetter } from '../api.js';

const AuthContext = createContext(null);

// Give api.js a live getter for the current access token (once).
setAccessTokenGetter(async () => {
  const { data } = await supabase.auth.getSession();
  return data.session?.access_token ?? null;
});

export function AuthProvider({ children }) {
  const [session, setSession] = useState(null);
  const [profile, setProfile] = useState(null); // app_user (role, school, etc.)
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // After a session exists, ensure a profile row (bootstrap enforces the school
  // domain) and load it.
  const loadProfile = useCallback(async (activeSession) => {
    if (!activeSession) {
      setProfile(null);
      return;
    }
    try {
      const { profile: existing } = await api.me();
      if (existing) {
        setProfile(existing);
      } else {
        const { profile: created } = await api.bootstrap();
        setProfile(created);
      }
      setError(null);
    } catch (err) {
      setError(err.message);
      setProfile(null);
    }
  }, []);

  useEffect(() => {
    let mounted = true;
    supabase.auth.getSession().then(async ({ data }) => {
      if (!mounted) return;
      setSession(data.session);
      await loadProfile(data.session);
      setLoading(false);
    });

    const { data: sub } = supabase.auth.onAuthStateChange(async (_event, newSession) => {
      setSession(newSession);
      await loadProfile(newSession);
    });
    return () => {
      mounted = false;
      sub.subscription.unsubscribe();
    };
  }, [loadProfile]);

  const signInWithGoogle = () =>
    supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: window.location.origin },
    });

  const signInWithPassword = (email, password) =>
    supabase.auth.signInWithPassword({ email, password });

  const signUpWithPassword = (email, password) =>
    supabase.auth.signUp({ email, password, options: { emailRedirectTo: window.location.origin } });

  const signOut = async () => {
    await supabase.auth.signOut();
    setProfile(null);
  };

  // Called by the Role Picker after submitting.
  const refreshProfile = useCallback(async () => {
    const { profile: p } = await api.me();
    setProfile(p);
    return p;
  }, []);

  const value = {
    session,
    profile,
    loading,
    error,
    isAuthed: !!session,
    needsRolePicker: !!session && !!profile && !profile.roleConfirmed,
    signInWithGoogle,
    signInWithPassword,
    signUpWithPassword,
    signOut,
    refreshProfile,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within <AuthProvider>');
  return ctx;
}
