// Question Bank generator UI — talks to the SEPARATE Render-hosted backend
// (questionBankApi.js), not the main same-origin api.js. Generation streams
// over SSE and can take minutes (a Paper 3 case ran ~172s in live testing),
// so this view shows live progress rather than a blank spinner.
//
// v1 stores nothing (see server/src/routes/questionBank.js) — a generated
// question exists only in this view until copied elsewhere by the teacher.

import { useEffect, useState, useCallback, useRef } from 'react';
import { questionBankApi } from '../questionBankApi.js';
import ExportControls from './ExportControls.jsx';
import { QuestionCard, ViewModeToggle } from './QuestionCard.jsx';

const COURSES = ['AA', 'AI'];
const LEVELS = ['SL', 'HL'];
const DIFFICULTY_POSITIONS = ['early', 'mid', 'late'];

export default function QuestionBankView() {
  const [course, setCourse] = useState('AA');
  const [level, setLevel] = useState('SL');
  const [taxonomy, setTaxonomy] = useState(null);
  const [paper, setPaper] = useState('');
  const [selectedCodes, setSelectedCodes] = useState([]);
  const [difficultyPosition, setDifficultyPosition] = useState('mid');
  const [targetMarks, setTargetMarks] = useState('');

  const [phase, setPhase] = useState(null); // null | 'generating' | 'validating' | 'retrying'
  const [attempt, setAttempt] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const [result, setResult] = useState(null); // { question, warnings, meta }

  const abortRef = useRef(null);

  const loadTaxonomy = useCallback(async () => {
    setError(null);
    try {
      const data = await questionBankApi.getTaxonomy(course, level);
      setTaxonomy(data);
      setPaper(data.papers[0]?.paper ?? '');
      setSelectedCodes([]);
    } catch (err) {
      setError(err.message);
      setTaxonomy(null);
    }
  }, [course, level]);

  useEffect(() => {
    loadTaxonomy();
  }, [loadTaxonomy]);

  // Abort any in-flight generation if the view unmounts.
  useEffect(() => () => abortRef.current?.abort(), []);

  const toggleCode = (code) => {
    setSelectedCodes((prev) =>
      prev.includes(code) ? prev.filter((c) => c !== code) : [...prev, code]
    );
  };

  const generate = async (e) => {
    e.preventDefault();
    if (selectedCodes.length === 0) {
      setError('Select at least one sub-topic.');
      return;
    }
    setError(null);
    setResult(null);
    setPhase('generating');
    setAttempt(1);
    setBusy(true);

    const controller = new AbortController();
    abortRef.current = controller;

    try {
      const data = await questionBankApi.generate(
        {
          course,
          level,
          paper,
          subtopicCodes: selectedCodes,
          difficultyPosition,
          targetMarks: targetMarks ? Number(targetMarks) : null,
        },
        {
          signal: controller.signal,
          onProgress: (evt) => {
            setPhase(evt.phase);
            setAttempt(evt.attempt ?? null);
          },
        }
      );
      setResult(data);
    } catch (err) {
      if (err.aborted) {
        // Cancelled deliberately — no error banner.
      } else {
        setError(err.message);
      }
    } finally {
      setPhase(null);
      setAttempt(null);
      setBusy(false);
      abortRef.current = null;
    }
  };

  const cancel = () => {
    abortRef.current?.abort();
  };

  return (
    <div className="grid grid-cols-1 gap-8 lg:grid-cols-[380px_1fr]">
      <aside className="space-y-4">
        <form
          onSubmit={generate}
          className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm"
        >
          <h2 className="mb-3 text-sm font-semibold text-slate-700">New question</h2>

          <label className="mb-1 block text-xs font-medium text-slate-500">Course</label>
          <div className="mb-3 flex gap-2">
            {COURSES.map((c) => (
              <PillButton key={c} active={course === c} onClick={() => setCourse(c)}>
                Mathematics {c}
              </PillButton>
            ))}
          </div>

          <label className="mb-1 block text-xs font-medium text-slate-500">Level</label>
          <div className="mb-3 flex gap-2">
            {LEVELS.map((l) => (
              <PillButton key={l} active={level === l} onClick={() => setLevel(l)}>
                {l}
              </PillButton>
            ))}
          </div>

          <label className="mb-1 block text-xs font-medium text-slate-500">Paper</label>
          <select
            value={paper}
            onChange={(e) => setPaper(e.target.value)}
            className="mb-3 w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-slate-400 focus:outline-none"
          >
            {(taxonomy?.papers ?? []).map((p) => (
              <option key={p.paper} value={p.paper}>
                {p.paper} — {p.marks} marks, {p.minutes} min ({p.calculator === 'none' ? 'no calculator' : 'GDC'})
              </option>
            ))}
          </select>

          <label className="mb-1 block text-xs font-medium text-slate-500">
            Sub-topics <span className="text-slate-400">(select one or more)</span>
          </label>
          <div className="mb-3 max-h-64 space-y-3 overflow-y-auto rounded-md border border-slate-200 p-2">
            {(taxonomy?.topics ?? []).map((topic) => (
              <div key={topic.number}>
                <div className="mb-1 text-xs font-semibold text-slate-500">
                  {topic.number}. {topic.name}
                </div>
                <div className="space-y-1">
                  {topic.subtopics.map((sub) => (
                    <label key={sub.code} className="flex items-start gap-2 text-xs text-slate-600">
                      <input
                        type="checkbox"
                        checked={selectedCodes.includes(sub.code)}
                        onChange={() => toggleCode(sub.code)}
                        className="mt-0.5"
                      />
                      <span>
                        <span className="font-mono text-slate-400">{sub.code}</span> {sub.description}
                      </span>
                    </label>
                  ))}
                </div>
              </div>
            ))}
            {!taxonomy && <div className="p-2 text-xs text-slate-400">Loading…</div>}
          </div>

          <label className="mb-1 block text-xs font-medium text-slate-500">Difficulty position</label>
          <select
            value={difficultyPosition}
            onChange={(e) => setDifficultyPosition(e.target.value)}
            className="mb-3 w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-slate-400 focus:outline-none"
          >
            {DIFFICULTY_POSITIONS.map((d) => (
              <option key={d} value={d}>{d}</option>
            ))}
          </select>

          <label className="mb-1 block text-xs font-medium text-slate-500">
            Target marks <span className="text-slate-400">(optional)</span>
          </label>
          <input
            type="number"
            min="1"
            value={targetMarks}
            onChange={(e) => setTargetMarks(e.target.value)}
            placeholder="e.g. 8"
            className="mb-3 w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-slate-400 focus:outline-none"
          />

          {busy ? (
            <button
              type="button"
              onClick={cancel}
              className="w-full rounded-md bg-red-50 px-3 py-2 text-sm font-medium text-red-600 hover:bg-red-100"
            >
              Cancel
            </button>
          ) : (
            <button
              type="submit"
              className="w-full rounded-md bg-slate-900 px-3 py-2 text-sm font-medium text-white hover:bg-slate-800"
            >
              Generate question
            </button>
          )}
        </form>
      </aside>

      <section>
        {error && (
          <div className="mb-4 rounded-md border border-red-200 bg-red-50 px-4 py-2 text-sm text-red-700">
            {error}
          </div>
        )}

        {busy && <ProgressPanel phase={phase} attempt={attempt} />}

        {!busy && result && <ResultPanel result={result} />}

        {!busy && !result && !error && (
          <div className="flex h-64 items-center justify-center rounded-lg border border-dashed border-slate-300 text-sm text-slate-400">
            Configure a question on the left and generate to get started.
          </div>
        )}
      </section>
    </div>
  );
}

function PillButton({ active, onClick, children }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-md px-3 py-1.5 text-sm font-medium transition ${
        active ? 'bg-slate-900 text-white' : 'border border-slate-300 text-slate-600 hover:bg-slate-100'
      }`}
    >
      {children}
    </button>
  );
}

const PHASE_LABEL = {
  generating: 'Generating with Claude…',
  validating: 'Validating against the §10 checklist…',
  retrying: 'Retrying — the first attempt failed validation…',
};

function ProgressPanel({ phase, attempt }) {
  return (
    <div className="flex h-64 flex-col items-center justify-center gap-3 rounded-lg border border-slate-200 bg-white text-sm text-slate-600 shadow-sm">
      <div className="h-6 w-6 animate-spin rounded-full border-2 border-slate-300 border-t-slate-900" />
      <div>{PHASE_LABEL[phase] ?? 'Working…'}</div>
      {attempt && <div className="text-xs text-slate-400">Attempt {attempt}</div>}
      <div className="text-xs text-slate-400">
        This can take a few minutes for larger papers — no need to wait on a frozen screen; you'll see progress update above.
      </div>
    </div>
  );
}

function ResultPanel({ result }) {
  const { question: q, warnings = [] } = result;
  const [viewMode, setViewMode] = useState('question');
  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <ViewModeToggle mode={viewMode} onChange={setViewMode} />
      </div>

      {warnings.length > 0 && (
        <div className="rounded-md border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          <div className="mb-1 font-semibold">Manual review flagged ({warnings.length})</div>
          <ul className="list-inside list-disc space-y-1">
            {warnings.map((w, i) => (
              <li key={i}>
                <span className="font-mono text-xs">[{w.code ?? w.category}]</span> {w.message ?? JSON.stringify(w)}
              </li>
            ))}
          </ul>
        </div>
      )}

      <QuestionCard question={q} mode={viewMode} />

      <ExportControls content={{ question: q }} />

      <details className="rounded-md border border-slate-200 bg-white p-3 text-xs text-slate-500">
        <summary className="cursor-pointer font-medium">Raw JSON</summary>
        <pre className="mt-2 overflow-x-auto">{JSON.stringify(result, null, 2)}</pre>
      </details>
    </div>
  );
}
