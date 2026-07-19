// First-login Role Picker: Teacher vs Coordinator + subject-assignment
// checkboxes. Choosing Coordinator surfaces an inline note that two-factor
// verification will be required going forward (the 2FA screen itself ships in
// Phase 5). Math AA / AI are selectable; other subjects are "coming soon".

import { useState } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext.jsx';
import { api } from '../api.js';
import AuthShell from './AuthShell.jsx';

const SUBJECTS = [
  { id: 'math_aa', label: 'Mathematics AA', hint: 'Analysis & Approaches', enabled: true },
  { id: 'math_ai', label: 'Mathematics AI', hint: 'Applications & Interpretation', enabled: true },
  { id: 'sciences', label: 'Sciences', hint: 'Coming soon', enabled: false },
  { id: 'langlit', label: 'Language & Literature', hint: 'Coming soon', enabled: false },
];

export default function RolePicker() {
  const { isAuthed, needsRolePicker, refreshProfile } = useAuth();
  const navigate = useNavigate();
  const [role, setRole] = useState(null); // 'teacher' | 'coordinator'
  const [subjects, setSubjects] = useState([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  if (!isAuthed) return <Navigate to="/signin" replace />;
  if (isAuthed && !needsRolePicker) return <Navigate to="/" replace />;

  const toggleSubject = (id) =>
    setSubjects((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]));

  const submit = async () => {
    if (!role) return setError('Choose Teacher or Coordinator.');
    setBusy(true);
    setError(null);
    try {
      await api.setRole(role, subjects);
      await refreshProfile();
      navigate('/');
    } catch (err) {
      setError(err.message);
      setBusy(false);
    }
  };

  return (
    <AuthShell title="Set up your account" subtitle="Tell us how you'll use Saaryavi." wide>
      {error && <p className="auth-error">{error}</p>}

      <div className="grid gap-3 sm:grid-cols-2">
        <RoleCard
          active={role === 'teacher'}
          onClick={() => setRole('teacher')}
          title="Teacher"
          desc="Upload and score your own students' IAs; manage your class."
        />
        <RoleCard
          active={role === 'coordinator'}
          onClick={() => setRole('coordinator')}
          title="Coordinator"
          desc="Whole-school supervisory view across teachers and subjects."
        />
      </div>

      {role === 'coordinator' && (
        <p className="auth-notice mt-3">
          Coordinator accounts require two-factor verification at sign-in going forward.
        </p>
      )}

      <div className="mt-6">
        <p className="section-label">Subjects you teach / oversee</p>
        <div className="mt-2 grid gap-2 sm:grid-cols-2">
          {SUBJECTS.map((s) => (
            <label
              key={s.id}
              className={`flex items-start gap-3 rounded-[var(--radius-btn)] border p-3 ${
                s.enabled
                  ? 'cursor-pointer border-[var(--color-line)] hover:border-[var(--color-accent)]'
                  : 'cursor-not-allowed border-[var(--color-line-faint)] opacity-55'
              }`}
            >
              <input
                type="checkbox"
                disabled={!s.enabled}
                checked={subjects.includes(s.id)}
                onChange={() => toggleSubject(s.id)}
                className="mt-0.5 accent-[var(--color-accent)]"
              />
              <span>
                <span className="block text-sm font-medium text-[var(--color-ink)]">{s.label}</span>
                <span className="block text-xs text-[var(--color-ink-faint)]">{s.hint}</span>
              </span>
            </label>
          ))}
        </div>
      </div>

      <button type="button" onClick={submit} disabled={busy} className="btn-primary mt-6 w-full">
        {busy ? 'Saving…' : 'Continue'}
      </button>
    </AuthShell>
  );
}

function RoleCard({ active, onClick, title, desc }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-[var(--radius-card)] border p-4 text-left transition ${
        active
          ? 'border-[var(--color-accent)] bg-[var(--color-conf-high-bg)]'
          : 'border-[var(--color-line)] bg-[var(--color-surface)] hover:border-[var(--color-accent)]'
      }`}
    >
      <span className="block font-serif text-lg font-semibold text-[var(--color-ink)]">{title}</span>
      <span className="mt-1 block text-sm text-[var(--color-ink-muted)]">{desc}</span>
    </button>
  );
}
