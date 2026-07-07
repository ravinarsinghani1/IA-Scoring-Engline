import { useState } from 'react';
import { api } from '../api.js';

// The originality coach panel. Complements Turnitin (which reports similarity /
// AI / sources) with actionable, integrity-positive coaching toward genuinely
// authentic work.

const CATEGORY_LABELS = {
  missing_citation: 'Needs a citation',
  add_own_analysis: 'Add your own analysis',
  unsupported_claim: 'Unsupported claim',
  patchwriting: 'Paraphrase needs real understanding',
  over_reliance: 'Over-relies on one source',
  data_provenance: 'Document your data / method',
  voice_inconsistency: 'Inconsistent authorial voice',
};

const READINESS = {
  strong: { label: 'Looks strong', cls: 'bg-green-50 text-green-700' },
  needs_work: { label: 'Needs work', cls: 'bg-amber-50 text-amber-700' },
  significant_concerns: { label: 'Significant concerns', cls: 'bg-red-50 text-red-700' },
};

const SEVERITY_CLS = {
  high: 'bg-red-100 text-red-700',
  medium: 'bg-amber-100 text-amber-700',
  low: 'bg-slate-100 text-slate-600',
};

export default function OriginalityCoach({ draft, onError }) {
  const [busy, setBusy] = useState(false);
  const [report, setReport] = useState(null);
  const [error, setError] = useState(null);

  const run = async () => {
    setBusy(true);
    setError(null);
    onError?.(null);
    try {
      setReport(await api.runOriginality(draft.id));
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="mt-3 rounded-md border border-indigo-100 bg-indigo-50/40 p-3">
      <div className="flex items-center justify-between">
        <span className="text-xs font-semibold text-indigo-900">
          Originality coach
          <span className="ml-1 font-normal text-indigo-400">· beyond Turnitin</span>
        </span>
        <button
          type="button"
          onClick={run}
          disabled={busy}
          className="rounded-md border border-indigo-300 bg-white px-3 py-1.5 text-xs font-medium text-indigo-700 transition hover:bg-indigo-600 hover:text-white disabled:opacity-40"
        >
          {busy ? 'Analysing…' : report ? 'Re-run coach' : 'Run originality coach'}
        </button>
      </div>

      {!report && !busy && !error && (
        <p className="mt-2 text-xs text-slate-500">
          Coaching toward genuinely authentic work — citation gaps, unsupported
          claims, and where to add your own analysis. It doesn't score AI or
          similarity (that's Turnitin) and isn't a certificate of authenticity.
        </p>
      )}
      {busy && (
        <p className="mt-2 text-xs text-slate-400">
          Reading the full document with Claude — this can take up to a minute…
        </p>
      )}
      {error && <p className="mt-2 text-xs text-red-600">{error}</p>}

      {report && <Report report={report} />}
    </div>
  );
}

function Report({ report }) {
  const readiness = READINESS[report.readiness] || READINESS.needs_work;
  return (
    <div className="mt-3 space-y-3">
      <div className="flex items-center gap-2">
        <span className={`rounded px-2 py-0.5 text-xs font-medium ${readiness.cls}`}>
          {readiness.label}
        </span>
      </div>
      <p className="text-xs text-slate-700">{report.summary}</p>

      {report.items?.length > 0 && (
        <ul className="space-y-2">
          {report.items.map((it, i) => (
            <li key={i} className="rounded-md border border-slate-200 bg-white p-2.5">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-slate-800">
                  {CATEGORY_LABELS[it.category] || it.category}
                </span>
                <span
                  className={`rounded px-1.5 py-0.5 text-[10px] font-medium ${
                    SEVERITY_CLS[it.severity] || SEVERITY_CLS.low
                  }`}
                >
                  {it.severity}
                </span>
              </div>
              {it.where && (
                <p className="mt-1 text-xs italic text-slate-500">“{it.where}”</p>
              )}
              <p className="mt-1 text-xs text-slate-600">{it.issue}</p>
              <p className="mt-1 text-xs text-slate-700">
                <span className="font-medium text-slate-500">Fix: </span>
                {it.fix}
              </p>
            </li>
          ))}
        </ul>
      )}

      {report.checklist?.length > 0 && (
        <div className="rounded-md border border-slate-200 bg-white p-2.5">
          <p className="mb-1.5 text-xs font-semibold text-slate-700">
            Academic-integrity checklist
          </p>
          <ul className="space-y-1">
            {report.checklist.map((c, i) => (
              <li key={i} className="flex items-start gap-2 text-xs">
                <span aria-hidden>{c.status === 'ok' ? '✅' : '⚠️'}</span>
                <span className="text-slate-600">
                  <span className="font-medium text-slate-700">{c.label}.</span> {c.note}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}

      <p className="text-[11px] leading-snug text-slate-400">
        Coaching guidance, not a verdict. Similarity and AI-writing come from
        Turnitin; final academic-integrity judgment rests with the teacher.
      </p>
    </div>
  );
}
