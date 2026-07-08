import { useEffect, useState, useCallback } from 'react';
import { api } from '../api.js';

const CRITERIA_META = [
  { k: 'A', name: 'Presentation', max: 4 },
  { k: 'B', name: 'Communication', max: 4 },
  { k: 'C', name: 'Personal engagement', max: 3 },
  { k: 'D', name: 'Reflection', max: 3 },
  { k: 'E', name: 'Use of mathematics', max: 6 },
];

const emptyMarks = () => ({ A: '', B: '', C: '', D: '', E: '' });

export default function ValidationView({ explorations, onError }) {
  const [explorationId, setExplorationId] = useState('');
  const [teacher, setTeacher] = useState(emptyMarks());
  const [ib, setIb] = useState(emptyMarks());
  const [showIb, setShowIb] = useState(false);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState(null);
  const [summary, setSummary] = useState(null);

  const loadSummary = useCallback(async () => {
    try {
      setSummary(await api.getValidationSummary());
    } catch (err) {
      onError?.(err.message);
    }
  }, [onError]);

  useEffect(() => {
    loadSummary();
  }, [loadSummary]);

  const run = async (e) => {
    e.preventDefault();
    if (!explorationId) return;
    setBusy(true);
    setResult(null);
    onError?.(null);
    try {
      const teacherMarks = pickFilled(teacher);
      const ibMarks = showIb ? pickFilled(ib) : {};
      const res = await api.runValidation(explorationId, teacherMarks, ibMarks);
      setResult(res.comparisons);
      await loadSummary();
    } catch (err) {
      onError?.(err.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-8">
      <div className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
        <h2 className="text-base font-semibold text-slate-900">Validate against known marks</h2>
        <p className="mt-1 text-sm text-slate-500">
          Enter the teacher-awarded marks for a past exploration, run the engine, and see the
          agreement per criterion. Runs the engine on the latest draft if it hasn't been scored
          yet (uses API credit). The authenticity gate does not block validation.
        </p>

        <form onSubmit={run} className="mt-4 space-y-4">
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-500">Exploration</label>
            <select
              value={explorationId}
              onChange={(e) => {
                setExplorationId(e.target.value);
                setResult(null);
              }}
              className="w-full max-w-md rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-slate-400 focus:outline-none"
            >
              <option value="">Select an exploration…</option>
              {explorations.map((ex) => (
                <option key={ex.id} value={ex.id}>
                  {ex.student_name} — {ex.subject} {ex.level} ({ex.draft_count} draft
                  {ex.draft_count === 1 ? '' : 's'})
                </option>
              ))}
            </select>
          </div>

          <MarkRow label="Teacher marks" marks={teacher} onChange={setTeacher} />

          <button
            type="button"
            onClick={() => setShowIb((v) => !v)}
            className="text-xs font-medium text-slate-500 underline-offset-2 hover:text-slate-700 hover:underline"
          >
            {showIb ? 'Hide' : 'Add'} IB moderated marks (optional)
          </button>
          {showIb && <MarkRow label="IB moderated marks" marks={ib} onChange={setIb} />}

          <button
            type="submit"
            disabled={busy || !explorationId}
            className="rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-40"
          >
            {busy ? 'Running…' : 'Run validation'}
          </button>
        </form>

        {result && <ComparisonTable rows={result} />}
      </div>

      {summary && <SummarySection summary={summary} />}
    </div>
  );
}

function MarkRow({ label, marks, onChange }) {
  return (
    <div>
      <label className="mb-1 block text-xs font-medium text-slate-500">{label}</label>
      <div className="flex flex-wrap gap-3">
        {CRITERIA_META.map((c) => (
          <label key={c.k} className="text-xs text-slate-600">
            <span className="mb-1 block font-medium text-slate-500">
              {c.k} <span className="text-slate-400">/{c.max}</span>
            </span>
            <input
              type="number"
              min="0"
              max={c.max}
              value={marks[c.k]}
              onChange={(e) => onChange({ ...marks, [c.k]: e.target.value })}
              className="w-16 rounded-md border border-slate-300 px-2 py-1.5 text-sm focus:border-slate-400 focus:outline-none"
            />
          </label>
        ))}
      </div>
    </div>
  );
}

function ComparisonTable({ rows }) {
  return (
    <div className="mt-5 overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-slate-200 text-left text-xs text-slate-500">
            <th className="py-2 pr-4">Criterion</th>
            <th className="py-2 pr-4">Engine</th>
            <th className="py-2 pr-4">Teacher</th>
            <th className="py-2 pr-4">IB</th>
            <th className="py-2 pr-4">Δ</th>
            <th className="py-2">Agreement</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.criterion} className="border-b border-slate-100">
              <td className="py-2 pr-4 font-medium text-slate-700">{r.criterion}</td>
              <td className="py-2 pr-4 text-slate-800">{engineDisplay(r)}</td>
              <td className="py-2 pr-4 text-slate-800">{r.teacher_mark ?? '—'}</td>
              <td className="py-2 pr-4 text-slate-500">{r.ib_moderated_mark ?? '—'}</td>
              <td className="py-2 pr-4 text-slate-600">
                {r.agreement_delta === null || r.agreement_delta === undefined
                  ? '—'
                  : r.agreement_delta > 0
                    ? `+${r.agreement_delta}`
                    : r.agreement_delta}
              </td>
              <td className="py-2">
                <AgreementBadge agreement={r.agreement} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function SummarySection({ summary }) {
  const { perCriterion, explorations } = summary;
  const anyData = explorations.length > 0;
  return (
    <div className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
      <h2 className="text-base font-semibold text-slate-900">
        Agreement across all validations
        <span className="ml-2 text-xs font-normal text-slate-400">
          {explorations.length} exploration{explorations.length === 1 ? '' : 's'}
        </span>
      </h2>

      {!anyData ? (
        <p className="mt-2 text-sm text-slate-400">No validations recorded yet.</p>
      ) : (
        <>
          <div className="mt-4 overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-200 text-left text-xs text-slate-500">
                  <th className="py-2 pr-4">Criterion</th>
                  <th className="py-2 pr-4">n</th>
                  <th className="py-2 pr-4">Exact / in-range</th>
                  <th className="py-2 pr-4">Within 1</th>
                  <th className="py-2">Mean |Δ|</th>
                </tr>
              </thead>
              <tbody>
                {CRITERIA_META.map((c) => {
                  const s = perCriterion[c.k];
                  if (!s || s.n === 0)
                    return (
                      <tr key={c.k} className="border-b border-slate-100 text-slate-400">
                        <td className="py-2 pr-4 font-medium">{c.k}</td>
                        <td className="py-2 pr-4" colSpan={4}>
                          —
                        </td>
                      </tr>
                    );
                  const hit = c.k === 'C' ? s.withinRange : s.exact;
                  return (
                    <tr key={c.k} className="border-b border-slate-100">
                      <td className="py-2 pr-4 font-medium text-slate-700">{c.k}</td>
                      <td className="py-2 pr-4 text-slate-600">{s.n}</td>
                      <td className="py-2 pr-4 text-slate-600">
                        {hit}/{s.n} ({pct(hit, s.n)})
                      </td>
                      <td className="py-2 pr-4 text-slate-600">
                        {c.k === 'C' ? '—' : `${s.within1}/${s.n} (${pct(s.within1, s.n)})`}
                      </td>
                      <td className="py-2 text-slate-600">{s.meanAbsDelta ?? '—'}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <div className="mt-6 overflow-x-auto">
            <h3 className="mb-2 text-sm font-semibold text-slate-700">Per exploration</h3>
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-200 text-left text-xs text-slate-500">
                  <th className="py-2 pr-4">Student</th>
                  {CRITERIA_META.map((c) => (
                    <th key={c.k} className="py-2 pr-3">
                      {c.k}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {explorations.map((ex) => {
                  const byCrit = Object.fromEntries(ex.rows.map((r) => [r.criterion, r]));
                  return (
                    <tr key={ex.exploration_id} className="border-b border-slate-100">
                      <td className="py-2 pr-4 text-slate-700">
                        {ex.student_name} <span className="text-slate-400">({ex.level})</span>
                      </td>
                      {CRITERIA_META.map((c) => {
                        const r = byCrit[c.k];
                        return (
                          <td key={c.k} className="py-2 pr-3">
                            {r ? (
                              <span title={`teacher ${r.teacher_mark ?? '—'} vs engine ${engineDisplay(r)}`}>
                                <AgreementDot agreement={r.agreement} />
                                <span className="ml-1 text-xs text-slate-500">
                                  {engineDisplay(r)}→{r.teacher_mark ?? '—'}
                                </span>
                              </span>
                            ) : (
                              '—'
                            )}
                          </td>
                        );
                      })}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}

function engineDisplay(r) {
  if (r.engine_range_low !== null && r.engine_range_low !== undefined) {
    return `${r.engine_range_low}–${r.engine_range_high}`;
  }
  return r.engine_mark ?? '—';
}

const AGREEMENT = {
  exact: { label: 'Exact', cls: 'bg-green-50 text-green-700', dot: 'bg-green-500' },
  within_range: { label: 'In range', cls: 'bg-green-50 text-green-700', dot: 'bg-green-500' },
  within_1: { label: 'Within 1', cls: 'bg-amber-50 text-amber-700', dot: 'bg-amber-500' },
  off: { label: 'Off', cls: 'bg-red-50 text-red-700', dot: 'bg-red-500' },
};

function AgreementBadge({ agreement }) {
  if (!agreement) return <span className="text-xs text-slate-400">—</span>;
  const a = AGREEMENT[agreement] || AGREEMENT.off;
  return <span className={`rounded px-1.5 py-0.5 text-xs font-medium ${a.cls}`}>{a.label}</span>;
}

function AgreementDot({ agreement }) {
  const a = AGREEMENT[agreement] || { dot: 'bg-slate-300' };
  return <span className={`inline-block h-2 w-2 rounded-full ${a.dot}`} aria-hidden />;
}

function pickFilled(marks) {
  const out = {};
  for (const [k, v] of Object.entries(marks)) {
    if (v !== '' && v !== null && v !== undefined) out[k] = Number(v);
  }
  return out;
}

function pct(hit, n) {
  return n ? `${Math.round((hit / n) * 100)}%` : '0%';
}
