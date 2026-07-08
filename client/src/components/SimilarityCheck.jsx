import { useState } from 'react';
import { api } from '../api.js';

// Public-web source-match check. Complements Turnitin (which also covers private
// databases): shows passages matching public sources, with links, framed as
// cite/rewrite.

const ASSESSMENT = {
  none: { label: 'No significant web matches', cls: 'bg-green-50 text-green-700' },
  some: { label: 'Some matches worth checking', cls: 'bg-amber-50 text-amber-700' },
  substantial: { label: 'Substantial matching', cls: 'bg-red-50 text-red-700' },
  unknown: { label: 'See notes', cls: 'bg-slate-100 text-slate-600' },
};

const MATCH_TYPE = {
  'close-copy': 'Close copy',
  'close-paraphrase': 'Close paraphrase',
  'common-knowledge': 'Common knowledge',
};

export default function SimilarityCheck({ draft, onError }) {
  const [busy, setBusy] = useState(false);
  const [report, setReport] = useState(null);
  const [error, setError] = useState(null);

  const run = async () => {
    setBusy(true);
    setError(null);
    onError?.(null);
    try {
      setReport(await api.runSimilarity(draft.id));
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="mt-3 rounded-md border border-sky-100 bg-sky-50/40 p-3">
      <div className="flex items-center justify-between">
        <span className="text-xs font-semibold text-sky-900">
          Web-source similarity
          <span className="ml-1 font-normal text-sky-400">· public web, complements Turnitin</span>
        </span>
        <button
          type="button"
          onClick={run}
          disabled={busy}
          className="rounded-md border border-sky-300 bg-white px-3 py-1.5 text-xs font-medium text-sky-700 transition hover:bg-sky-600 hover:text-white disabled:opacity-40"
        >
          {busy ? 'Searching the web…' : report ? 'Re-run check' : 'Run web-source check'}
        </button>
      </div>

      {!report && !busy && !error && (
        <p className="mt-2 text-xs text-slate-500">
          Searches the public web for passages that match the exploration, with source
          links, so they can be cited or rewritten. Doesn't reproduce Turnitin's score
          (Turnitin also checks private databases) — use it alongside your Turnitin report.
        </p>
      )}
      {busy && (
        <p className="mt-2 text-xs text-slate-400">
          Reading the document and searching the web — this can take a minute or two…
        </p>
      )}
      {error && <p className="mt-2 text-xs text-red-600">{error}</p>}

      {report && <Report report={report} />}
    </div>
  );
}

function Report({ report }) {
  const a = ASSESSMENT[report.assessment] || ASSESSMENT.unknown;
  return (
    <div className="mt-3 space-y-3">
      <span className={`inline-block rounded px-2 py-0.5 text-xs font-medium ${a.cls}`}>
        {a.label}
      </span>
      {report.summary && <p className="text-xs text-slate-700">{report.summary}</p>}

      {report.matches?.length > 0 && (
        <ul className="space-y-2">
          {report.matches.map((m, i) => (
            <li key={i} className="rounded-md border border-slate-200 bg-white p-2.5">
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs font-semibold text-slate-800">
                  {MATCH_TYPE[m.match_type] || m.match_type || 'Match'}
                </span>
                {m.source_url && (
                  <a
                    href={m.source_url}
                    target="_blank"
                    rel="noreferrer"
                    className="truncate text-xs text-sky-700 underline underline-offset-2 hover:text-sky-900"
                    title={m.source_url}
                  >
                    {m.source_title || m.source_url}
                  </a>
                )}
              </div>
              {m.passage && (
                <p className="mt-1 text-xs italic text-slate-500">“{m.passage}”</p>
              )}
              {m.recommendation && (
                <p className="mt-1 text-xs text-slate-700">
                  <span className="font-medium text-slate-500">Fix: </span>
                  {m.recommendation}
                </p>
              )}
            </li>
          ))}
        </ul>
      )}

      <p className="text-[11px] leading-snug text-slate-400">
        Public-web evidence only. Your Turnitin report remains the authoritative
        similarity check; matched passages should be cited or genuinely rewritten.
      </p>
    </div>
  );
}
