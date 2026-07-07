import { useState } from 'react';
import { api } from '../api.js';

// The authenticity gate for a single draft. Records the similarity + AI-content
// scores, shows pass/blocked/not-checked status, and gates the (placeholder)
// scoring action so the hard-gate behaviour is visible end to end.
export default function AuthenticityPanel({ draft, onChanged, onError }) {
  const checked =
    draft.authenticity_similarity_score !== null &&
    draft.authenticity_similarity_score !== undefined &&
    draft.authenticity_ai_label_score !== null &&
    draft.authenticity_ai_label_score !== undefined;
  const passed = draft.authenticity_gate_passed;

  const [similarity, setSimilarity] = useState(
    checked ? String(draft.authenticity_similarity_score) : ''
  );
  const [aiLabel, setAiLabel] = useState(
    checked ? String(draft.authenticity_ai_label_score) : ''
  );
  const [open, setOpen] = useState(!checked);
  const [busy, setBusy] = useState(false);

  const [scoring, setScoring] = useState(false);
  const [scoreMsg, setScoreMsg] = useState(null);

  const record = async (e) => {
    e.preventDefault();
    if (similarity === '' || aiLabel === '') return;
    setBusy(true);
    onError?.(null);
    try {
      await api.recordAuthenticity(draft.id, Number(similarity), Number(aiLabel));
      setScoreMsg(null);
      await onChanged?.();
      setOpen(false);
    } catch (err) {
      onError?.(err.message);
    } finally {
      setBusy(false);
    }
  };

  const attemptScore = async () => {
    setScoring(true);
    setScoreMsg(null);
    onError?.(null);
    try {
      const res = await api.scoreDraft(draft.id);
      setScoreMsg({ ok: true, text: res.message });
    } catch (err) {
      setScoreMsg({ ok: false, text: err.message });
    } finally {
      setScoring(false);
    }
  };

  return (
    <div className="mt-4 rounded-md border border-slate-200 bg-slate-50/60 p-3">
      <div className="flex items-center justify-between">
        <StatusBadge checked={checked} passed={passed} draft={draft} />
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          className="text-xs font-medium text-slate-500 underline-offset-2 hover:text-slate-700 hover:underline"
        >
          {open ? 'Hide' : checked ? 'Re-check' : 'Record check'}
        </button>
      </div>

      {open && (
        <form onSubmit={record} className="mt-3 space-y-3">
          <p className="text-xs text-slate-500">
            Enter the authenticity results. The gate passes only when{' '}
            <strong>both scores are 0</strong>. (Manual entry for now — a live
            similarity / AI-detector check can be wired in later.)
          </p>
          <div className="flex gap-3">
            <ScoreInput
              label="Similarity"
              value={similarity}
              onChange={setSimilarity}
            />
            <ScoreInput
              label="AI-content label"
              value={aiLabel}
              onChange={setAiLabel}
            />
          </div>
          <button
            type="submit"
            disabled={busy || similarity === '' || aiLabel === ''}
            className="rounded-md bg-slate-900 px-3 py-1.5 text-xs font-medium text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-40"
          >
            {busy ? 'Saving…' : 'Save authenticity check'}
          </button>
        </form>
      )}

      <ScoringGate
        passed={passed}
        scoring={scoring}
        scoreMsg={scoreMsg}
        onScore={attemptScore}
      />
    </div>
  );
}

function StatusBadge({ checked, passed, draft }) {
  if (!checked) {
    return (
      <span className="rounded bg-amber-50 px-2 py-0.5 text-xs font-medium text-amber-700">
        Authenticity gate: not checked
      </span>
    );
  }
  if (passed) {
    return (
      <span className="rounded bg-green-50 px-2 py-0.5 text-xs font-medium text-green-700">
        ✓ Authenticity gate passed · {draft.authenticity_similarity_score}% sim ·{' '}
        {draft.authenticity_ai_label_score}% AI
      </span>
    );
  }
  return (
    <span className="rounded bg-red-50 px-2 py-0.5 text-xs font-medium text-red-700">
      ✕ Authenticity gate blocked · {draft.authenticity_similarity_score}% sim ·{' '}
      {draft.authenticity_ai_label_score}% AI
    </span>
  );
}

function ScoreInput({ label, value, onChange }) {
  return (
    <label className="flex-1 text-xs text-slate-600">
      <span className="mb-1 block font-medium text-slate-500">{label} (%)</span>
      <input
        type="number"
        min="0"
        max="100"
        step="1"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder="0"
        className="w-full rounded-md border border-slate-300 px-2 py-1.5 text-sm focus:border-slate-400 focus:outline-none"
      />
    </label>
  );
}

// Visibly represents the hard gate: scoring is locked until the gate passes.
function ScoringGate({ passed, scoring, scoreMsg, onScore }) {
  return (
    <div className="mt-3 border-t border-slate-200 pt-3">
      {passed ? (
        <div>
          <button
            type="button"
            onClick={onScore}
            disabled={scoring}
            className="rounded-md border border-slate-800 bg-white px-3 py-1.5 text-xs font-medium text-slate-800 transition hover:bg-slate-800 hover:text-white disabled:opacity-40"
          >
            {scoring ? 'Scoring…' : 'Score this draft'}
          </button>
          {scoreMsg && (
            <p
              className={`mt-2 text-xs ${
                scoreMsg.ok ? 'text-slate-600' : 'text-red-600'
              }`}
            >
              {scoreMsg.text}
            </p>
          )}
        </div>
      ) : (
        <div className="flex items-center gap-2 text-xs text-slate-500">
          <span aria-hidden>🔒</span>
          <span>
            <strong className="text-slate-600">Scoring locked.</strong> The
            authenticity gate must pass (both scores at 0) before this draft can
            be scored.
          </span>
        </div>
      )}
    </div>
  );
}
