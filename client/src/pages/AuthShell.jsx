// Shared frame for the unauthenticated screens: branded teal panel + centered
// card. Keeps SignIn / SignUp / RolePicker visually consistent.

import Logo from '../components/brand/Logo.jsx';

export default function AuthShell({ title, subtitle, children, wide = false }) {
  return (
    <div className="grid min-h-screen lg:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)]">
      {/* Brand panel */}
      <div className="hidden flex-col justify-between bg-[var(--color-brand)] p-10 text-white lg:flex">
        <Logo variant="light" />
        <div>
          <h2 className="font-serif text-3xl font-semibold leading-snug">
            Criterion-level IA feedback,<br />benchmarked to the IB guide.
          </h2>
          <p className="mt-3 max-w-sm text-sm text-white/70">
            Advisory scoring and feedback for IB DP Internal Assessments — every mark
            remains subject to teacher assessment and IB moderation.
          </p>
        </div>
        <p className="text-xs text-white/50">Saaryavi School · IB DP</p>
      </div>

      {/* Form side */}
      <div className="flex items-center justify-center bg-[var(--color-canvas)] p-6">
        <div className={`w-full ${wide ? 'max-w-2xl' : 'max-w-sm'}`}>
          <div className="mb-6 lg:hidden">
            <Logo variant="dark" />
          </div>
          <h1 className="font-serif text-2xl font-semibold text-[var(--color-ink)]">{title}</h1>
          {subtitle && <p className="mt-1 text-sm text-[var(--color-ink-muted)]">{subtitle}</p>}
          <div className="mt-6 rounded-[var(--radius-card)] border border-[var(--color-line)] bg-[var(--color-surface)] p-6">
            {children}
          </div>
        </div>
      </div>
    </div>
  );
}
