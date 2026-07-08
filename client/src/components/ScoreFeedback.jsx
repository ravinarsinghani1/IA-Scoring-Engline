import { useState } from 'react';

// Two presentations of the same per-criterion scores:
//  - Student view (Step 7): friendly "what you did well / what to change".
//  - Teacher view (Step 8): compact skim strip, estimated total, and only the
//    criteria that need attention (low-confidence, boundary, or changed since
//    the last draft) expanded; stable high-confidence criteria recede.

const CRIT_NAMES = {
  A: 'Presentation',
  B: 'Mathematical communication',
  C: 'Personal engagement',
  D: 'Reflection',
  E: 'Use of mathematics',
};
const ORDER = ['A', 'B', 'C', 'D', 'E'];

const ordered = (scores) => ORDER.map((k) => scores.find((s) => s.criterion === k)).filter(Boolean);
const isRange = (s) => s.confidence_tier === 'low';
const levelText = (s) => (isRange(s) ? `${s.range_low}–${s.range_high}` : `${s.engine_mark}`);
const needsAttention = (s) => isRange(s) || s.review_recommended || s.changed_since_last_draft;

export default function ScoreFeedback({ scores }) {
  const [mode, setMode] = useState('student');
  const rows = ordered(scores);
  return (
    <div className="mt-3">
      <div className="mb-3 flex gap-2">
        <Toggle active={mode === 'student'} onClick={() => setMode('student')}>
          Student view
        </Toggle>
        <Toggle active={mode === 'teacher'} onClick={() => setMode('teacher')}>
          Teacher view
        </Toggle>
      </div>
      {mode === 'student' ? <StudentView rows={rows} /> : <TeacherView rows={rows} />}
    </div>
  );
}

function Toggle({ active, onClick, children }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-md border px-2.5 py-1 text-xs font-medium transition ${
        active
          ? 'border-slate-800 bg-slate-800 text-white'
          : 'border-slate-300 bg-white text-slate-600 hover:border-slate-400'
      }`}
    >
      {children}
    </button>
  );
}

/* ---------------- Student view (Step 7) ---------------- */

function StudentView({ rows }) {
  return (
    <div className="space-y-3">
      {rows.map((s) => (
        <div key={s.criterion} className="rounded-md border border-slate-200 bg-white p-3">
          <div className="flex items-baseline justify-between">
            <span className="text-sm font-semibold text-slate-800">
              Criterion {s.criterion} · {CRIT_NAMES[s.criterion]}
            </span>
            <span className="text-sm font-semibold text-slate-900">
              {levelText(s)}
              <span className="text-slate-400">/{s.max_mark}</span>
            </span>
          </div>

          {isRange(s) && (
            <p className="mt-1 text-xs text-indigo-600">
              This is a suggested range — your teacher makes the final call on personal engagement.
            </p>
          )}

          <div className="mt-2 rounded bg-green-50 px-2.5 py-1.5">
            <p className="text-xs text-green-800">
              <span className="font-semibold">What you did well: </span>
              {s.reasoning_summary}
            </p>
          </div>

          {(isRange(s) || s.engine_mark < s.max_mark) && (
            <div className="mt-2 rounded bg-amber-50 px-2.5 py-1.5">
              <p className="text-xs text-amber-800">
                <span className="font-semibold">What to change: </span>
                {s.improvement_suggestion}
              </p>
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

/* ---------------- Teacher view (Step 8) ---------------- */

function TeacherView({ rows }) {
  const C = rows.find((s) => s.criterion === 'C');
  const base = rows
    .filter((s) => !isRange(s))
    .reduce((sum, s) => sum + (s.engine_mark ?? 0), 0);
  const totalMax = rows.reduce((sum, s) => sum + s.max_mark, 0);
  const lo = base + (C ? C.range_low : 0);
  const hi = base + (C ? C.range_high : 0);

  const attention = rows.filter(needsAttention);

  return (
    <div>
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium text-slate-500">Estimated total (advisory)</span>
        <span className="text-sm font-semibold text-slate-900">
          {lo === hi ? lo : `${lo}–${hi}`}
          <span className="text-slate-400">/{totalMax}</span>
        </span>
      </div>

      {/* Compact 5-box strip. Stable high-confidence criteria recede. */}
      <div className="mt-2 grid grid-cols-5 gap-2">
        {rows.map((s) => (
          <Box key={s.criterion} s={s} attention={needsAttention(s)} />
        ))}
      </div>

      <div className="mt-4">
        <p className="mb-2 text-xs font-semibold text-slate-700">
          Needs your attention ({attention.length})
        </p>
        {attention.length === 0 ? (
          <p className="text-xs text-slate-400">
            All criteria are stable and high-confidence — nothing flagged for review.
          </p>
        ) : (
          <ul className="space-y-2">
            {attention.map((s) => (
              <AttentionCard key={s.criterion} s={s} />
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

function Box({ s, attention }) {
  const tone = isRange(s)
    ? 'border-indigo-300 bg-indigo-50 text-indigo-800'
    : attention
      ? 'border-amber-300 bg-amber-50 text-amber-800'
      : 'border-slate-200 bg-white text-slate-400'; // receded
  return (
    <div className={`rounded-md border px-1 py-2 text-center ${tone}`}>
      <div className="text-xs font-semibold">{s.criterion}</div>
      <div className="text-sm font-bold">{levelText(s)}</div>
      <div className="text-[10px] opacity-70">/{s.max_mark}</div>
      {s.changed_since_last_draft && (
        <div className="mt-0.5 text-[10px] font-medium text-amber-700">↑ changed</div>
      )}
    </div>
  );
}

function AttentionCard({ s }) {
  const reasons = [];
  if (isRange(s)) reasons.push('advisory — mandatory review');
  if (s.review_recommended && !isRange(s)) reasons.push('on a level boundary');
  if (s.changed_since_last_draft) reasons.push('changed since last draft');

  return (
    <li className="rounded-md border border-slate-200 bg-white p-2.5">
      <div className="flex items-baseline justify-between">
        <span className="text-xs font-semibold text-slate-800">
          Criterion {s.criterion} · {CRIT_NAMES[s.criterion]}
        </span>
        <span className="text-xs font-semibold text-slate-900">
          {levelText(s)}
          <span className="text-slate-400">/{s.max_mark}</span>
        </span>
      </div>
      {reasons.length > 0 && (
        <p className="mt-0.5 text-[11px] font-medium text-amber-700">{reasons.join(' · ')}</p>
      )}
      {s.boundary_note && (
        <p className="mt-1 text-xs text-slate-600">{s.boundary_note}</p>
      )}
      <p className="mt-1 text-xs text-slate-600">
        <span className="font-medium text-slate-500">Why: </span>
        {s.reasoning_summary}
      </p>
    </li>
  );
}
