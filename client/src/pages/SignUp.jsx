// Sign Up — Google Workspace SSO or school-email registration. Registration is
// school-domain-locked: the backend's /auth/bootstrap rejects any email whose
// domain isn't a registered school. We surface that expectation here in copy.

import { useState } from 'react';
import { Link, Navigate, useNavigate } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext.jsx';
import AuthShell from './AuthShell.jsx';

export default function SignUp() {
  const { isAuthed, signInWithGoogle, signUpWithPassword } = useAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const [notice, setNotice] = useState(null);

  if (isAuthed) return <Navigate to="/" replace />;

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const { data, error: err } = await signUpWithPassword(email, password);
    setBusy(false);
    if (err) return setError(err.message);
    // If email confirmation is on, there's no session yet.
    if (data.session) navigate('/');
    else setNotice('Check your school email to confirm your account, then sign in.');
  };

  return (
    <AuthShell title="Create account" subtitle="Register with your school Google Workspace or email.">
      <button type="button" onClick={signInWithGoogle} className="btn-google">
        Continue with Google Workspace
      </button>

      <div className="my-5 flex items-center gap-3 text-xs text-[var(--color-ink-faint)]">
        <span className="h-px flex-1 bg-[var(--color-line)]" />
        or register with school email
        <span className="h-px flex-1 bg-[var(--color-line)]" />
      </div>

      {error && <p className="auth-error">{error}</p>}
      {notice && <p className="auth-notice">{notice}</p>}

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
            autoComplete="new-password"
            required
            minLength={8}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </label>
        <p className="text-xs text-[var(--color-ink-faint)]">
          We'll verify this against your school's registered domain.
        </p>
        <button type="submit" disabled={busy} className="btn-primary w-full">
          {busy ? 'Creating…' : 'Create account'}
        </button>
      </form>

      <p className="mt-4 text-sm text-[var(--color-ink-muted)]">
        Already have an account?{' '}
        <Link to="/signin" className="auth-link">Sign in</Link>
      </p>
    </AuthShell>
  );
}
