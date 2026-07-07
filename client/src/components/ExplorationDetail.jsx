import { useEffect, useState, useCallback } from 'react';
import { api } from '../api.js';

export default function ExplorationDetail({ explorationId, onDraftSubmitted, onError }) {
  const [exploration, setExploration] = useState(null);
  const [rawText, setRawText] = useState('');
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      setExploration(await api.getExploration(explorationId));
    } catch (err) {
      onError(err.message);
    }
  }, [explorationId, onError]);

  useEffect(() => {
    setRawText('');
    load();
  }, [explorationId, load]);

  const submit = async (e) => {
    e.preventDefault();
    if (!rawText.trim()) return;
    setBusy(true);
    onError(null);
    try {
      await api.submitDraft(explorationId, rawText);
      setRawText('');
      await load();
      onDraftSubmitted?.();
    } catch (err) {
      onError(err.message);
    } finally {
      setBusy(false);
    }
  };

  if (!exploration) {
    return <div className="text-sm text-slate-400">Loading…</div>;
  }

  const drafts = [...(exploration.drafts ?? [])].reverse(); // newest first

  return (
    <div className="space-y-6">
      <div className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex items-baseline justify-between">
          <h2 className="text-base font-semibold text-slate-900">
            {exploration.student_name}
          </h2>
          <span className="text-xs text-slate-400">
            Mathematics {exploration.subject} {exploration.level}
            {exploration.student_id ? ` · ID ${exploration.student_id}` : ''}
          </span>
        </div>

        <form onSubmit={submit} className="mt-4">
          <label className="mb-1 block text-xs font-medium text-slate-500">
            Submit a new draft (paste the exploration text)
          </label>
          <textarea
            value={rawText}
            onChange={(e) => setRawText(e.target.value)}
            rows={8}
            placeholder="Paste the full text of the student's exploration here…"
            className="w-full resize-y rounded-md border border-slate-300 px-3 py-2 font-mono text-sm leading-relaxed focus:border-slate-400 focus:outline-none"
          />
          <div className="mt-2 flex items-center justify-between">
            <span className="text-xs text-slate-400">
              Will be stored as draft #{(exploration.current_draft_number ?? 0) + 1}
            </span>
            <button
              type="submit"
              disabled={busy || !rawText.trim()}
              className="rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-40"
            >
              {busy ? 'Submitting…' : 'Submit draft'}
            </button>
          </div>
        </form>
      </div>

      <div>
        <h3 className="mb-2 text-sm font-semibold text-slate-700">
          Drafts ({drafts.length})
        </h3>
        {drafts.length === 0 ? (
          <div className="rounded-lg border border-dashed border-slate-300 px-4 py-8 text-center text-sm text-slate-400">
            No drafts submitted yet.
          </div>
        ) : (
          <ul className="space-y-3">
            {drafts.map((d) => (
              <DraftCard key={d.id} draft={d} />
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

function DraftCard({ draft }) {
  return (
    <li className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
      <div className="flex items-center justify-between">
        <span className="text-sm font-semibold text-slate-800">
          Draft #{draft.draft_number}
        </span>
        <span className="text-xs text-slate-400">
          {formatDate(draft.submitted_at)}
        </span>
      </div>

      <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-500">
        <span>{draft.word_count.toLocaleString()} words</span>
        <span>~{draft.page_count} page{draft.page_count === 1 ? '' : 's'}</span>
        <AuthenticityBadge draft={draft} />
      </div>

      <p className="mt-3 line-clamp-3 text-sm text-slate-600">
        {draft.raw_text}
      </p>
    </li>
  );
}

// Placeholder until Step 2 wires the real authenticity gate.
function AuthenticityBadge({ draft }) {
  if (draft.authenticity_gate_passed) {
    return (
      <span className="rounded bg-green-50 px-1.5 py-0.5 font-medium text-green-700">
        Authenticity gate passed
      </span>
    );
  }
  return (
    <span className="rounded bg-amber-50 px-1.5 py-0.5 font-medium text-amber-700">
      Authenticity gate: not checked
    </span>
  );
}

function formatDate(s) {
  if (!s) return '';
  // SQLite datetime('now') is UTC 'YYYY-MM-DD HH:MM:SS'
  const d = new Date(s.replace(' ', 'T') + 'Z');
  return isNaN(d) ? s : d.toLocaleString();
}
