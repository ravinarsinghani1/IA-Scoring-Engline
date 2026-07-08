import { useState } from 'react';
import { api } from '../api.js';

// Teacher-facing authorship advisory. NOT an AI detector: no score, no verdict.
// Flags passages worth a good-faith conversation, with the observable signal and
// a way to check. Heavy false-positive caveat is shown prominently.

const OVERALL = {
  nothing_notable: { label: 'Nothing notable', cls: 'bg-green-50 text-green-700' },
  worth_a_conversation: { label: 'A passage worth a conversation', cls: 'bg-amber-50 text-amber-700' },
  several_worth_a_conversation: {
    label: 'Several passages worth a conversation',
    cls: 'bg-amber-100 text-amber-800',
  },
};

export default function AiAuthorshipAdvisory({ draft, onError }) {
  const [busy, setBusy] = useState(false);
  const [report, setReport] = useState(null);
  const [error, setError] = useState(null);

  const run = async () => {
    setBusy(true);
    setError(null);
    onError?.(null);
    try {
      setReport(await api.runAuthorshipAdvisory(draft.id));
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="mt-3 rounded-md border border-purple-100 bg-purple-50/40 p-3">
      <div className="flex items-center justify-between">
        <span className="text-xs font-semibold text-purple-900">
          AI-authorship advisory
          <span className="ml-1 font-normal text-purple-400">· teacher-only · not a detector</span>
        </span>
        <button
          type="button"
          onClick={run}
          disabled={busy}
          className="rounded-md border border-purple-300 bg-white px-3 py-1.5 text-xs font-medium text-purple-700 transition hover:bg-purple-600 hover:text-white disabled:opacity-40"
        >
          {busy ? 'Reviewing…' : report ? 'Re-run advisory' : 'Run authorship advisory'}
        </button>
      </div>

      {/* Always-visible caveat — this is the whole point of the design. */}
      <p className="mt-2 rounded bg-white/70 px-2 py-1.5 text-[11px] leading-snug text-slate-500">
        This is <strong>not</strong> an AI detector and gives <strong>no score or verdict</strong>.
        It only flags passages worth discussing with the student. These signals are
        unreliable — false alarms are common, especially for second-language and
        naturally formal writers. Never treat a flag as proof; use it to start a
        good-faith conversation.
      </p>

      {busy && (
        <p className="mt-2 text-xs text-slate-400">Reading the full document with Claude…</p>
      )}
      {error && <p className="mt-2 text-xs text-red-600">{error}</p>}

      {report && <Report report={report} />}
    </div>
  );
}

function Report({ report }) {
  const o = OVERALL[report.overall] || OVERALL.worth_a_conversation;
  return (
    <div className="mt-3 space-y-3">
      <span className={`inline-block rounded px-2 py-0.5 text-xs font-medium ${o.cls}`}>
        {o.label}
      </span>
      {report.summary && <p className="text-xs text-slate-700">{report.summary}</p>}

      {report.flags?.length > 0 ? (
        <ul className="space-y-2">
          {report.flags.map((f, i) => (
            <li key={i} className="rounded-md border border-slate-200 bg-white p-2.5">
              {f.passage && (
                <p className="text-xs italic text-slate-500">“{f.passage}”</p>
              )}
              <p className="mt-1 text-xs text-slate-600">
                <span className="font-medium text-slate-500">What stands out: </span>
                {f.signal}
              </p>
              <p className="mt-1 text-xs text-slate-700">
                <span className="font-medium text-slate-500">How to check: </span>
                {f.check}
              </p>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-xs text-slate-500">No passages flagged for a conversation.</p>
      )}
    </div>
  );
}
