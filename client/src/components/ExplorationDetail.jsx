import { useEffect, useState, useCallback } from 'react';
import { api } from '../api.js';
import AuthenticityPanel from './AuthenticityPanel.jsx';
import OriginalityCoach from './OriginalityCoach.jsx';
import SimilarityCheck from './SimilarityCheck.jsx';
import AiAuthorshipAdvisory from './AiAuthorshipAdvisory.jsx';

export default function ExplorationDetail({ explorationId, onDraftSubmitted, onError }) {
  const [exploration, setExploration] = useState(null);
  const [file, setFile] = useState(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      setExploration(await api.getExploration(explorationId));
    } catch (err) {
      onError(err.message);
    }
  }, [explorationId, onError]);

  useEffect(() => {
    setFile(null);
    load();
  }, [explorationId, load]);

  const submit = async (e) => {
    e.preventDefault();
    if (!file) return;
    setBusy(true);
    onError(null);
    try {
      await api.submitDraftFile(explorationId, file);
      setFile(null);
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
  const nextNumber = (exploration.current_draft_number ?? 0) + 1;

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
          <PdfDropZone file={file} onFile={setFile} onError={onError} />
          <p className="mt-2 text-xs text-slate-400">
            The PDF is sent to the model as-is, so figures, graphs and equations
            are included in the assessment.
          </p>

          <div className="mt-2 flex items-center justify-between">
            <span className="text-xs text-slate-400">
              Will be stored as draft #{nextNumber}
            </span>
            <button
              type="submit"
              disabled={busy || !file}
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
              <DraftCard key={d.id} draft={d} onChanged={load} onError={onError} />
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

function DraftCard({ draft, onChanged, onError }) {
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

      <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-slate-500">
        <span>{draft.word_count.toLocaleString()} words</span>
        <span>~{draft.page_count} page{draft.page_count === 1 ? '' : 's'}</span>
        {draft.source_kind === 'pdf' && (
          <span className="rounded bg-slate-100 px-1.5 py-0.5 font-medium text-slate-600">
            📄 {draft.source_file_name || 'PDF'} · figures & equations included
          </span>
        )}
      </div>

      <p className="mt-3 line-clamp-3 text-sm text-slate-600">
        {draft.raw_text || <span className="italic text-slate-400">PDF uploaded (no extractable text preview).</span>}
      </p>

      <OriginalityCoach draft={draft} onError={onError} />
      <SimilarityCheck draft={draft} onError={onError} />
      <AiAuthorshipAdvisory draft={draft} onError={onError} />
      <AuthenticityPanel draft={draft} onChanged={onChanged} onError={onError} />
    </li>
  );
}


function PdfDropZone({ file, onFile, onError }) {
  const [dragOver, setDragOver] = useState(false);

  const pick = (f) => {
    if (!f) return;
    if (f.type !== 'application/pdf') {
      onError?.('Only PDF files are supported. For Word, save as PDF first.');
      return;
    }
    onError?.(null);
    onFile(f);
  };

  return (
    <label
      onDragOver={(e) => {
        e.preventDefault();
        setDragOver(true);
      }}
      onDragLeave={() => setDragOver(false)}
      onDrop={(e) => {
        e.preventDefault();
        setDragOver(false);
        pick(e.dataTransfer.files?.[0]);
      }}
      className={`flex cursor-pointer flex-col items-center justify-center rounded-md border-2 border-dashed px-4 py-8 text-center transition ${
        dragOver ? 'border-slate-500 bg-slate-50' : 'border-slate-300 hover:border-slate-400'
      }`}
    >
      <input
        type="file"
        accept="application/pdf,.pdf"
        className="hidden"
        onChange={(e) => pick(e.target.files?.[0])}
      />
      {file ? (
        <div className="text-sm text-slate-700">
          <span className="font-medium">📄 {file.name}</span>
          <div className="mt-1 text-xs text-slate-400">
            {(file.size / 1024 / 1024).toFixed(2)} MB · click to choose a different file
          </div>
        </div>
      ) : (
        <div className="text-sm text-slate-500">
          <span className="font-medium text-slate-700">Click to choose a PDF</span> or
          drag &amp; drop it here
          <div className="mt-1 text-xs text-slate-400">Max 32 MB · PDF only</div>
        </div>
      )}
    </label>
  );
}

function formatDate(s) {
  if (!s) return '';
  // SQLite datetime('now') is UTC 'YYYY-MM-DD HH:MM:SS'
  const d = new Date(s.replace(' ', 'T') + 'Z');
  return isNaN(d) ? s : d.toLocaleString();
}
