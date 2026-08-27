// Manual question + mark scheme entry — for a teacher's own material, not
// model-generated. Deliberately simpler than the generated-question shape:
// no alternative-method (EITHER/OR) branching, just one annotated mark line
// per row, which covers the overwhelming majority of hand-written questions
// and keeps this form usable rather than mirroring the full §5 spec.
//
// Mirrors server/src/services/questionBank/markScheme.js's annotation
// convention (M/A/R + digit, or AG) so a custom question's marks line up
// with generated ones in the same paper and in the PDF/Word export — but
// re-implemented here rather than imported, since client and server are
// separate bundles with no shared module boundary today.

import { useState } from 'react';

const ANNOTATION_OPTIONS = ['M1', 'M2', 'A1', 'A2', 'R1', 'AG'];

/** Marks a single annotation token is worth — mirrors markScheme.js's ANNOTATION_CODES. */
function annotationMarks(code) {
  if (code === 'AG') return 0;
  const m = /^([MAR])(\d+)$/.exec(code);
  return m ? Number(m[2]) : 0;
}

function newLine() {
  return { annotation: 'M1', reason: '' };
}

function newPart(index) {
  const letters = 'abcdefghij';
  return {
    label: `(${letters[index] ?? index + 1})`,
    commandTerm: '',
    marks: 1,
    prompt: '',
    lines: [newLine()],
  };
}

export default function CustomQuestionForm({ course, level, paper, onAdd, onCancel }) {
  const [parts, setParts] = useState([newPart(0)]);
  const [error, setError] = useState(null);

  const updatePart = (i, patch) => setParts((ps) => ps.map((p, pi) => (pi === i ? { ...p, ...patch } : p)));
  const removePart = (i) => setParts((ps) => ps.filter((_, pi) => pi !== i));
  const addPart = () => setParts((ps) => [...ps, newPart(ps.length)]);

  const updateLine = (pi, li, patch) =>
    setParts((ps) => ps.map((p, i) => (i !== pi ? p : { ...p, lines: p.lines.map((l, j) => (j === li ? { ...l, ...patch } : l)) })));
  const addLine = (pi) => setParts((ps) => ps.map((p, i) => (i !== pi ? p : { ...p, lines: [...p.lines, newLine()] })));
  const removeLine = (pi, li) =>
    setParts((ps) => ps.map((p, i) => (i !== pi ? p : { ...p, lines: p.lines.filter((_, j) => j !== li) })));

  const lineMarksTotal = (part) => part.lines.reduce((s, l) => s + annotationMarks(l.annotation), 0);

  const submit = (e) => {
    e.preventDefault();
    if (parts.length === 0) {
      setError('Add at least one part.');
      return;
    }
    for (const p of parts) {
      if (!p.prompt.trim()) {
        setError(`Part ${p.label} needs prompt text.`);
        return;
      }
      if (!p.marks || p.marks < 1) {
        setError(`Part ${p.label} needs a positive mark value.`);
        return;
      }
      if (p.lines.some((l) => !l.reason.trim())) {
        setError(`Part ${p.label} has a mark-scheme line with no reason — fill it in or remove the line.`);
        return;
      }
    }
    setError(null);

    const totalMarks = parts.reduce((s, p) => s + Number(p.marks), 0);
    const question = {
      course, level, paper,
      totalMarks,
      custom: true,
      parts: parts.map((p) => {
        const markSchemeLines = p.lines.map((l) => ({ annotation: l.annotation, text: l.reason }));
        const allocationLine = `[${p.lines.map((l) => `${l.annotation} ${l.reason}`).join(', ')} — ${p.marks} ${p.marks === 1 ? 'mark' : 'marks'}]`;
        return {
          label: p.label,
          commandTerm: p.commandTerm || undefined,
          marks: Number(p.marks),
          prompt: p.prompt,
          markSchemeLines,
          allocationLine,
        };
      }),
      totalLine: `Total: [${totalMarks} ${totalMarks === 1 ? 'mark' : 'marks'}]`,
    };
    onAdd(question);
  };

  return (
    <form onSubmit={submit} className="space-y-4 rounded-lg border border-indigo-200 bg-indigo-50/40 p-4">
      <h3 className="text-sm font-semibold text-slate-700">Write your own question</h3>
      {error && (
        <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">{error}</div>
      )}

      {parts.map((part, pi) => {
        const linesTotal = lineMarksTotal(part);
        const mismatch = part.lines.length > 0 && linesTotal !== Number(part.marks);
        return (
          <div key={pi} className="space-y-2 rounded-md border border-slate-200 bg-white p-3">
            <div className="flex items-center gap-2">
              <input
                value={part.label}
                onChange={(e) => updatePart(pi, { label: e.target.value })}
                className="w-20 rounded border border-slate-300 px-2 py-1 text-sm font-medium"
              />
              <input
                value={part.commandTerm}
                onChange={(e) => updatePart(pi, { commandTerm: e.target.value })}
                placeholder="command term (optional, e.g. Solve)"
                className="flex-1 rounded border border-slate-300 px-2 py-1 text-xs"
              />
              <input
                type="number"
                min="1"
                value={part.marks}
                onChange={(e) => updatePart(pi, { marks: e.target.value })}
                className="w-20 rounded border border-slate-300 px-2 py-1 text-xs"
              />
              <span className="text-xs text-slate-400">marks</span>
              {parts.length > 1 && (
                <button type="button" onClick={() => removePart(pi)} className="text-xs font-medium text-red-500 hover:text-red-700">
                  Remove
                </button>
              )}
            </div>

            <textarea
              value={part.prompt}
              onChange={(e) => updatePart(pi, { prompt: e.target.value })}
              placeholder="Question prompt — wrap math in $...$ (e.g. Solve $x^2 - 5x + 6 = 0$.)"
              rows={2}
              className="w-full rounded border border-slate-300 px-2 py-1.5 text-sm"
            />

            <div className="rounded-md bg-slate-50 p-2">
              <div className="mb-1 text-xs font-semibold text-slate-500">Mark scheme</div>
              <div className="space-y-1.5">
                {part.lines.map((line, li) => (
                  <div key={li} className="flex items-center gap-2">
                    <select
                      value={line.annotation}
                      onChange={(e) => updateLine(pi, li, { annotation: e.target.value })}
                      className="rounded border border-slate-300 px-1.5 py-1 font-mono text-xs"
                    >
                      {ANNOTATION_OPTIONS.map((a) => <option key={a} value={a}>{a}</option>)}
                    </select>
                    <input
                      value={line.reason}
                      onChange={(e) => updateLine(pi, li, { reason: e.target.value })}
                      placeholder="reason — e.g. for correct method"
                      className="flex-1 rounded border border-slate-300 px-2 py-1 text-xs"
                    />
                    {part.lines.length > 1 && (
                      <button type="button" onClick={() => removeLine(pi, li)} className="text-xs text-red-500 hover:text-red-700">✕</button>
                    )}
                  </div>
                ))}
              </div>
              <button
                type="button"
                onClick={() => addLine(pi)}
                className="mt-1.5 text-xs font-medium text-slate-500 underline decoration-dotted"
              >
                + add mark line
              </button>
              {mismatch && (
                <div className="mt-1.5 text-xs text-amber-700">
                  Mark lines sum to {linesTotal}, but the part is worth {part.marks} — you can still save, but check this.
                </div>
              )}
            </div>
          </div>
        );
      })}

      <button type="button" onClick={addPart} className="text-xs font-medium text-slate-500 underline decoration-dotted">
        + add another part
      </button>

      <div className="flex gap-2 pt-2">
        <button type="submit" className="rounded-md bg-slate-900 px-3 py-2 text-sm font-medium text-white hover:bg-slate-800">
          Add to paper
        </button>
        <button type="button" onClick={onCancel} className="rounded-md border border-slate-300 px-3 py-2 text-sm font-medium text-slate-600 hover:bg-slate-100">
          Cancel
        </button>
      </div>
    </form>
  );
}
