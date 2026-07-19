// Sign In — Google Workspace SSO (primary) + school email/password.
// The prototype's demo-only "Sign in as Teacher/Coordinator" control is
// intentionally omitted: role comes from the account record, not a toggle.

import { useState } from 'react';
import { Link, Navigate, useNavigate } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext.jsx';
import AuthShell from './AuthShell.jsx';

export default function SignIn() {
  const { isAuthed, signInWithGoogle, signInWithPassword } = useAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  if (isAuthed) return <Navigate to="/" replace />;

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const { error: err } = await signInWithPassword(email, password);
    setBusy(false);
    if (err) setError(err.message);
    else navigate('/');
  };

  return (
    <AuthShell title="Sign in" subtitle="Welcome back to Saaryavi.">
      <button type="button" onClick={signInWithGoogle} className="btn-google">
        <GoogleGlyph />
        Continue with Google Workspace
      </button>

      <div className="my-5 flex items-center gap-3 text-xs text-[var(--color-ink-faint)]">
        <span className="h-px flex-1 bg-[var(--color-line)]" />
        or use your school email
        <span className="h-px flex-1 bg-[var(--color-line)]" />
      </div>

      {error && <p className="auth-error">{error}</p>}

      <form onSubmit={submit} className="space-y-3">
        <label className="auth-field">
          <span>School email</span>
          <input
            type="email"
            autoComplete="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@school.edu"
          />
        </label>
        <label className="auth-field">
          <span>Password</span>
          <input
            type="password"
            autoComplete="current-password"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </label>
        <button type="submit" disabled={busy} className="btn-primary w-full">
          {busy ? 'Signing in…' : 'Sign in'}
        </button>
      </form>

      {/* Password reset (forgot-password) is a Phase 0 follow-up: it needs a
          reset-request + set-new-password screen pair. Omitted here rather than
          shipping a dead link that goes nowhere. */}
      <div className="mt-4 text-sm">
        <Link to="/signup" className="auth-link">Create account</Link>
      </div>
    </AuthShell>
  );
}

function GoogleGlyph() {
  return (
    <svg width="18" height="18" viewBox="0 0 48 48" aria-hidden="true">
      <path fill="#EA4335" d="M24 9.5c3.5 0 6.6 1.2 9 3.6l6.7-6.7C35.6 2.6 30.2 0 24 0 14.6 0 6.5 5.4 2.6 13.2l7.8 6.1C12.3 13.2 17.6 9.5 24 9.5z"/>
      <path fill="#4285F4" d="M46.5 24.5c0-1.6-.1-3.1-.4-4.5H24v9h12.7c-.5 3-2.2 5.5-4.7 7.2l7.2 5.6C43.7 37.6 46.5 31.6 46.5 24.5z"/>
      <path fill="#FBBC05" d="M10.4 28.7c-.5-1.5-.8-3-.8-4.7s.3-3.2.8-4.7l-7.8-6.1C1 16.4 0 20.1 0 24s1 7.6 2.6 10.8l7.8-6.1z"/>
      <path fill="#34A853" d="M24 48c6.2 0 11.4-2 15.2-5.5l-7.2-5.6c-2 1.4-4.6 2.2-8 2.2-6.4 0-11.7-3.7-13.6-9.1l-7.8 6.1C6.5 42.6 14.6 48 24 48z"/>
    </svg>
  );
}
