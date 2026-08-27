// Appends one more question to an already-built paper — either generated
// (reuses the same single-question SSE pipeline as QuestionBankView, so it
// gets the same §10 validation) or hand-written (CustomQuestionForm). Lives
// entirely in PaperBuilderView's client-side state; nothing is persisted
// server-side (v1 stores nothing — see routes/questionBank.js).

import { useState } from 'react';
import { questionBankApi } from '../questionBankApi.js';
import CustomQuestionForm from './CustomQuestionForm.jsx';

const DIFFICULTY_POSITIONS = ['early', 'mid', 'late'];

export default function AddQuestionPanel({ course, level, paper, taxonomy, onAdd }) {
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState(null); // null | 'generate' | 'custom'

  const [selectedCodes, setSelectedCodes] = useState([]);
  const [difficultyPosition, setDifficultyPosition] = useState('mid');
  const [targetMarks, setTargetMarks] = useState('');
  const [busy, setBusy] = useState(false);
  const [phase, setPhase] = useState(null);
  const [error, setError] = useState(null);

  const toggleCode = (code) =>
    setSelectedCodes((prev) => (prev.includes(code) ? prev.filter((c) => c !== code) : [...prev, code]));

  const close = () => {
    setOpen(false);
    setMode(null);
    setError(null);
    setSelectedCodes([]);
    setTargetMarks('');
  };

  const generate = async (e) => {
    e.preventDefault();
    if (selectedCodes.length === 0) {
      setError('Select at least one sub-topic.');
      return;
    }
    setError(null);
    setBusy(true);
    setPhase('generating');
    try {
      const data = await questionBankApi.generate(
        {
          course, level, paper,
          subtopicCodes: selectedCodes,
          difficultyPosition,
          targetMarks: targetMarks ? Number(targetMarks) : null,
        },
        { onProgress: (evt) => setPhase(evt.phase) }
      );
      onAdd(data.question);
      close();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
      setPhase(null);
    }
  };

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="w-full rounded-lg border border-dashed border-slate-300 py-3 text-sm font-medium text-slate-500 hover:border-slate-400 hover:text-slate-700"
      >
        + Add question to this paper
      </button>
    );
  }

  if (mode === 'custom') {
    return (
      <CustomQuestionForm
        course={course}
        level={level}
        paper={paper}
        onAdd={(q) => { onAdd(q); close(); }}
        onCancel={close}
      />
    );
  }

  if (mode === 'generate') {
    return (
      <form onSubmit={generate} className="space-y-3 rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold text-slate-700">Generate another question</h3>
          <button type="button" onClick={close} className="text-xs text-slate-400 hover:text-slate-600">Cancel</button>
        </div>

        {error && <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">{error}</div>}

        <div>
          <label className="mb-1 block text-xs font-medium text-slate-500">
            Sub-topics <span className="text-slate-400">(select one or more)</span>
          </label>
          <div className="max-h-56 space-y-3 overflow-y-auto rounded-md border border-slate-200 p-2">
            {(taxonomy?.topics ?? []).map((topic) => (
              <div key={topic.number}>
                <div className="mb-1 text-xs font-semibold text-slate-500">{topic.number}. {topic.name}</div>
                <div className="space-y-1">
                  {topic.subtopics.map((sub) => (
                    <label key={sub.code} className="flex items-start gap-2 text-xs text-slate-600">
                      <input
                        type="checkbox"
                        checked={selectedCodes.includes(sub.code)}
                        onChange={() => toggleCode(sub.code)}
                        className="mt-0.5"
                      />
                      <span><span className="font-mono text-slate-400">{sub.code}</span> {sub.description}</span>
                    </label>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="flex gap-3">
          <div className="flex-1">
            <label className="mb-1 block text-xs font-medium text-slate-500">Difficulty position</label>
            <select
              value={difficultyPosition}
              onChange={(e) => setDifficultyPosition(e.target.value)}
              className="w-full rounded-md border border-slate-300 px-2 py-1.5 text-sm"
            >
              {DIFFICULTY_POSITIONS.map((d) => <option key={d} value={d}>{d}</option>)}
            </select>
          </div>
          <div className="flex-1">
            <label className="mb-1 block text-xs font-medium text-slate-500">Target marks (optional)</label>
            <input
              type="number"
              min="1"
              value={targetMarks}
              onChange={(e) => setTargetMarks(e.target.value)}
              placeholder="e.g. 8"
              className="w-full rounded-md border border-slate-300 px-2 py-1.5 text-sm"
            />
          </div>
        </div>

        <button
          type="submit"
          disabled={busy}
          className="w-full rounded-md bg-slate-900 px-3 py-2 text-sm font-medium text-white hover:bg-slate-800 disabled:opacity-50"
        >
          {busy ? (phase === 'retrying' ? 'Retrying…' : phase === 'validating' ? 'Validating…' : 'Generating…') : 'Generate and add'}
        </button>
        {busy && (
          <p className="text-center text-xs text-slate-400">This can take a minute or two — the question is validated before it's added.</p>
        )}
      </form>
    );
  }

  return (
    <div className="flex gap-3 rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
      <button
        type="button"
        onClick={() => setMode('generate')}
        className="flex-1 rounded-md bg-slate-900 px-3 py-2 text-sm font-medium text-white hover:bg-slate-800"
      >
        Generate from the question bank
      </button>
      <button
        type="button"
        onClick={() => setMode('custom')}
        className="flex-1 rounded-md border border-slate-300 px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-100"
      >
        Write my own
      </button>
      <button type="button" onClick={close} className="px-2 text-xs text-slate-400 hover:text-slate-600">Cancel</button>
    </div>
  );
}
