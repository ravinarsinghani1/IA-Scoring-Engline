import { useEffect, useState, useCallback } from 'react';
import { api } from '../api.js';
import AuthenticityPanel from './AuthenticityPanel.jsx';
import OriginalityCoach from './OriginalityCoach.jsx';

export default function ExplorationDetail({ explorationId, onDraftSubmitted, onError }) {
  const [exploration, setExploration] = useState(null);
  const [mode, setMode] = useState('pdf'); // 'pdf' (recommended) | 'text'
  const [rawText, setRawText] = useState('');
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
    setRawText('');
    setFile(null);
    load();
  }, [explorationId, load]);

  const submit = async (e) => {
    e.preventDefault();
    if (mode === 'pdf' ? !file : !rawText.trim()) return;
    setBusy(true);
    onError(null);
    try {
      if (mode === 'pdf') {
        await api.submitDraftFile(explorationId, file);
      } else {
        await api.submitDraft(explorationId, rawText);
      }
      setRawText('');
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

        <div className="mt-4 mb-3 flex gap-2">
          <ModeTab active={mode === 'pdf'} onClick={() => setMode('pdf')}>
            Upload PDF
          </ModeTab>
          <ModeTab active={mode === 'text'} onClick={() => setMode('text')}>
            Paste text
          </ModeTab>
        </div>

        <form onSubmit={submit}>
          {mode === 'pdf' ? (
            <>
              <PdfDropZone file={file} onFile={setFile} onError={onError} />
              <p className="mt-2 text-xs text-slate-400">
                Recommended — the PDF is sent to the model as-is, so figures,
                graphs and equations are included in the assessment.
              </p>
            </>
          ) : (
            <>
              <textarea
                value={rawText}
                onChange={(e) => setRawText(e.target.value)}
                rows={8}
                placeholder="Paste the full text of the student's exploration here…"
                className="w-full resize-y rounded-md border border-slate-300 px-3 py-2 font-mono text-sm leading-relaxed focus:border-slate-400 focus:outline-none"
              />
              <p className="mt-2 text-xs text-amber-600">
                Note: pasted text loses figures, graphs and equations. Upload a
                PDF for the most accurate scoring.
              </p>
            </>
          )}

          <div className="mt-2 flex items-center justify-between">
            <span className="text-xs text-slate-400">
              Will be stored as draft #{nextNumber}
            </span>
            <button
              type="submit"
              disabled={busy || (mode === 'pdf' ? !file : !rawText.trim())}
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
      <AuthenticityPanel draft={draft} onChanged={onChanged} onError={onError} />
    </li>
  );
}

function ModeTab({ active, onClick, children }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-md border px-3 py-1.5 text-xs font-medium transition ${
        active
          ? 'border-slate-800 bg-slate-800 text-white'
          : 'border-slate-300 bg-white text-slate-600 hover:border-slate-400'
      }`}
    >
      {children}
    </button>
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
