// Paper Builder — assembles a full worksheet/paper of multiple independently
// -validated questions (server: paperBuilder.js). No Section A/B: a flat,
// ordered list. Worksheet mode (default) accepts any target mark total;
// "Full paper" mode uses the REAL exam total for the chosen paper (§2.5).
//
// Talks to the same separate Render-hosted backend as QuestionBankView, via
// questionBankApi.buildPaper() (SSE, same lifecycle-event contract as a
// single question, plus 'plan'/'question-start' phases — see questionBankApi.js).

import { useEffect, useState, useCallback, useRef } from 'react';
import { questionBankApi } from '../questionBankApi.js';
import ExportControls from './ExportControls.jsx';
import { QuestionCard, ViewModeToggle } from './QuestionCard.jsx';
import AddQuestionPanel from './AddQuestionPanel.jsx';

const COURSES = ['AA', 'AI'];
const LEVELS = ['SL', 'HL'];
const DIFFICULTY_POSITIONS = ['early', 'mid', 'late'];

export default function PaperBuilderView() {
  const [course, setCourse] = useState('AA');
  const [level, setLevel] = useState('SL');
  const [taxonomy, setTaxonomy] = useState(null);
  const [paper, setPaper] = useState('');
  const [examSimulation, setExamSimulation] = useState(false);
  const [targetMarks, setTargetMarks] = useState('40');
  const [difficultyPosition, setDifficultyPosition] = useState('mid');
  const [restrictTopics, setRestrictTopics] = useState(false);
  const [selectedCodes, setSelectedCodes] = useState([]);

  const [phase, setPhase] = useState(null);
  const [questionIndex, setQuestionIndex] = useState(null);
  const [questionCount, setQuestionCount] = useState(null);
  const [attempt, setAttempt] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const [result, setResult] = useState(null); // { paper, warnings, meta } — as returned by the build, untouched
  const [viewMode, setViewMode] = useState('question'); // 'question' | 'markscheme'

  // The paper as displayed/exported, which can diverge from `result.paper`
  // once the teacher adds or removes a question (see addQuestion/removeQuestion).
  // Kept as separate state — result stays the honest record of what the
  // build actually produced (meta.totalAttempts etc. describe that build,
  // not any later manual edits).
  const [editablePaper, setEditablePaper] = useState(null);
  const [paperWarnings, setPaperWarnings] = useState([]);

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

  useEffect(() => () => abortRef.current?.abort(), []);

  const realTotalFor = (p) => taxonomy?.papers.find((x) => x.paper === p);

  const toggleCode = (code) => {
    setSelectedCodes((prev) =>
      prev.includes(code) ? prev.filter((c) => c !== code) : [...prev, code]
    );
  };

  const build = async (e) => {
    e.preventDefault();
    if (restrictTopics && selectedCodes.length === 0) {
      setError('Restrict-to-topics is on, but no sub-topics are selected. Pick at least one, or turn restriction off.');
      return;
    }
    if (!examSimulation && (!targetMarks || Number(targetMarks) < 1)) {
      setError('Enter a positive target mark total, or switch to "Build the real full paper".');
      return;
    }
    setError(null);
    setResult(null);
    setPhase('plan');
    setBusy(true);

    const controller = new AbortController();
    abortRef.current = controller;

    try {
      const data = await questionBankApi.buildPaper(
        {
          course, level, paper,
          examSimulation,
          targetMarks: examSimulation ? null : Number(targetMarks),
          difficultyPosition,
          subtopicCodes: restrictTopics ? selectedCodes : null,
        },
        {
          signal: controller.signal,
          onProgress: (evt) => {
            setPhase(evt.phase);
            setQuestionIndex(evt.questionIndex ?? null);
            setQuestionCount(evt.questionCount ?? null);
            setAttempt(evt.attempt ?? null);
          },
        }
      );
      setResult(data);
      setEditablePaper(data.paper);
      setPaperWarnings(data.warnings ?? []);
    } catch (err) {
      if (!err.aborted) setError(err.message);
    } finally {
      setPhase(null);
      setQuestionIndex(null);
      setQuestionCount(null);
      setAttempt(null);
      setBusy(false);
      abortRef.current = null;
    }
  };

  const cancel = () => abortRef.current?.abort();

  // Renumber sequentially and recompute totals — the single source of truth
  // for question numbering/marks after any manual edit, generated or custom.
  const addQuestion = (question, extraWarnings = []) => {
    setEditablePaper((prev) => {
      const questions = [...prev.questions, { ...question, number: prev.questions.length + 1 }];
      return {
        ...prev,
        questions,
        questionCount: questions.length,
        totalMarks: questions.reduce((s, q) => s + q.totalMarks, 0),
      };
    });
    if (extraWarnings.length > 0) {
      setPaperWarnings((prev) => [
        ...prev,
        ...extraWarnings.map((w) => ({ ...w, questionNumber: (editablePaper?.questions.length ?? 0) + 1 })),
      ]);
    }
  };

  const removeQuestion = (index) => {
    setEditablePaper((prev) => {
      const removedNumber = prev.questions[index]?.number;
      const questions = prev.questions
        .filter((_, i) => i !== index)
        .map((q, i) => ({ ...q, number: i + 1 }));
      // Drop warnings tied to the removed question; warnings for questions
      // that shifted position keep the label they were generated under
      // (a minor, low-stakes staleness — the warning's content still
      // identifies the actual issue either way).
      setPaperWarnings((ws) => ws.filter((w) => w.questionNumber !== removedNumber));
      return {
        ...prev,
        questions,
        questionCount: questions.length,
        totalMarks: questions.reduce((s, q) => s + q.totalMarks, 0),
      };
    });
  };

  return (
    <div className="grid grid-cols-1 gap-8 lg:grid-cols-[380px_1fr]">
      <aside className="space-y-4">
        <form onSubmit={build} className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
          <h2 className="mb-3 text-sm font-semibold text-slate-700">Build a paper</h2>

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
                {p.paper} — real total {p.marks} marks, {p.minutes} min ({p.calculator === 'none' ? 'no calculator' : 'GDC'})
              </option>
            ))}
          </select>

          <div className="mb-3 rounded-md border border-slate-200 p-3">
            <label className="flex items-start gap-2 text-xs text-slate-600">
              <input
                type="checkbox"
                checked={examSimulation}
                onChange={(e) => setExamSimulation(e.target.checked)}
                className="mt-0.5"
              />
              <span>
                Build the real full paper ({realTotalFor(paper)?.marks ?? '—'} marks) instead of a worksheet
              </span>
            </label>

            {!examSimulation && (
              <div className="mt-2">
                <label className="mb-1 block text-xs font-medium text-slate-500">Target marks (worksheet)</label>
                <input
                  type="number"
                  min="1"
                  value={targetMarks}
                  onChange={(e) => setTargetMarks(e.target.value)}
                  placeholder="e.g. 40"
                  className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-slate-400 focus:outline-none"
                />
                <p className="mt-1 text-xs text-slate-400">
                  Worksheet-first is the default — any total you like, not tied to the real exam length.
                </p>
              </div>
            )}
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

          <label className="mb-2 flex items-center gap-2 text-xs text-slate-600">
            <input
              type="checkbox"
              checked={restrictTopics}
              onChange={(e) => setRestrictTopics(e.target.checked)}
            />
            Restrict to specific sub-topics (otherwise draws from the whole {course} {level} syllabus, weighted by §2.1 teaching hours)
          </label>

          {restrictTopics && (
            <div className="mb-3 max-h-56 space-y-3 overflow-y-auto rounded-md border border-slate-200 p-2">
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
          )}

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
              Build paper
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

        {busy && (
          <ProgressPanel phase={phase} questionIndex={questionIndex} questionCount={questionCount} attempt={attempt} />
        )}

        {!busy && result && editablePaper && (
          <PaperResultPanel
            meta={result.meta}
            paper={editablePaper}
            warnings={paperWarnings}
            viewMode={viewMode}
            onViewModeChange={setViewMode}
            onAddQuestion={addQuestion}
            onRemoveQuestion={removeQuestion}
            taxonomy={taxonomy}
          />
        )}

        {!busy && !result && !error && (
          <div className="flex h-64 items-center justify-center rounded-lg border border-dashed border-slate-300 text-sm text-slate-400">
            Configure a paper on the left and build it to get started. A multi-question paper can take several minutes — you'll see per-question progress.
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
  plan: 'Planning the paper (question count, topic mix)…',
  'question-start': 'Starting the next question…',
  generating: 'Generating with Claude…',
  validating: 'Validating against the §10 checklist…',
  retrying: 'Retrying — that question failed validation…',
};

function ProgressPanel({ phase, questionIndex, questionCount, attempt }) {
  return (
    <div className="flex h-64 flex-col items-center justify-center gap-3 rounded-lg border border-slate-200 bg-white text-sm text-slate-600 shadow-sm">
      <div className="h-6 w-6 animate-spin rounded-full border-2 border-slate-300 border-t-slate-900" />
      <div>{PHASE_LABEL[phase] ?? 'Working…'}</div>
      {questionIndex && questionCount && (
        <div className="text-xs text-slate-500">Question {questionIndex} of {questionCount}</div>
      )}
      {attempt && <div className="text-xs text-slate-400">Attempt {attempt}</div>}
      <div className="max-w-xs text-center text-xs text-slate-400">
        A full paper can take several minutes — one question is generated and validated at a time.
      </div>
    </div>
  );
}

function PaperResultPanel({ meta, paper, warnings, viewMode, onViewModeChange, onAddQuestion, onRemoveQuestion, taxonomy }) {
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-slate-200 bg-white px-4 py-3 text-sm text-slate-600">
        <div>
          <span className="font-semibold text-slate-800">
            {paper.course} {paper.level} {paper.paper}
          </span>
          {' — '}{paper.questionCount} question{paper.questionCount === 1 ? '' : 's'}, {paper.totalMarks} marks total
          {paper.examSimulation && <span className="ml-1 text-slate-400">(full paper)</span>}
          {meta && <span className="ml-2 text-xs text-slate-400">{meta.totalAttempts} model attempt{meta.totalAttempts === 1 ? '' : 's'} in the original build</span>}
        </div>
        <ViewModeToggle mode={viewMode} onChange={onViewModeChange} />
      </div>

      {warnings.length > 0 && (
        <div className="rounded-md border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          <div className="mb-1 font-semibold">Manual review flagged ({warnings.length})</div>
          <ul className="list-inside list-disc space-y-1">
            {warnings.map((w, i) => (
              <li key={i}>
                <span className="font-mono text-xs">Q{w.questionNumber} [{w.check}]</span> {w.message}
              </li>
            ))}
          </ul>
        </div>
      )}

      {paper.questions.map((q, i) => (
        <QuestionCard
          key={q.number}
          question={q}
          mode={viewMode}
          onRemove={() => onRemoveQuestion(i)}
        />
      ))}

      <AddQuestionPanel
        course={paper.course}
        level={paper.level}
        paper={paper.paper}
        taxonomy={taxonomy}
        onAdd={onAddQuestion}
      />

      <ExportControls content={{ paper }} />

      <details className="rounded-md border border-slate-200 bg-white p-3 text-xs text-slate-500">
        <summary className="cursor-pointer font-medium">Raw JSON</summary>
        <pre className="mt-2 overflow-x-auto">{JSON.stringify({ paper, warnings, meta }, null, 2)}</pre>
      </details>
    </div>
  );
}
