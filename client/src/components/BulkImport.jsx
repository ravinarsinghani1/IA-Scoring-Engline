import { useState } from 'react';
import { api } from '../api.js';

// Batch calibration: drop several PDFs, fill in each student's known teacher
// (and optional IB) marks, then run them all through the engine and validation
// in one go. Pure client-side orchestration over existing endpoints, processed
// sequentially so you see per-file progress and one failure doesn't stop the run.

const CRITERIA_META = [
  { k: 'A', max: 4 },
  { k: 'B', max: 4 },
  { k: 'C', max: 3 },
  { k: 'D', max: 3 },
  { k: 'E', max: 6 },
];
const emptyMarks = () => ({ A: '', B: '', C: '', D: '', E: '' });
let _uid = 0;

export default function BulkImport({ onDone, onError }) {
  const [rows, setRows] = useState([]);
  const [showIb, setShowIb] = useState(true);
  const [running, setRunning] = useState(false);

  const addFiles = (files) => {
    const pdfs = [...files].filter((f) => f.type === 'application/pdf');
    if (pdfs.length !== files.length) onError?.('Only PDF files are supported; non-PDFs were skipped.');
    setRows((prev) => [
      ...prev,
      ...pdfs.map((file) => ({
        id: ++_uid,
        file,
        studentName: file.name.replace(/\.pdf$/i, ''),
        subject: 'AI',
        level: 'SL',
        teacher: emptyMarks(),
        ib: emptyMarks(),
        status: 'idle', // idle | running | done | error
        result: null,
        error: null,
      })),
    ]);
  };

  const patch = (id, changes) =>
    setRows((prev) => prev.map((r) => (r.id === id ? { ...r, ...changes } : r)));

  const runBatch = async () => {
    setRunning(true);
    onError?.(null);
    for (const row of rows) {
      if (row.status === 'done') continue;
      patch(row.id, { status: 'running', error: null });
      try {
        const exp = await api.createExploration({
          studentName: row.studentName.trim() || row.file.name,
          subject: row.subject,
          level: row.level,
        });
        await api.submitDraftFile(exp.id, row.file);
        const res = await api.runValidation(
          exp.id,
          filled(row.teacher),
          showIb ? filled(row.ib) : {}
        );
        patch(row.id, { status: 'done', result: res.comparisons });
      } catch (err) {
        patch(row.id, { status: 'error', error: err.message });
      }
    }
    setRunning(false);
    await onDone?.();
  };

  const pending = rows.filter((r) => r.status !== 'done').length;

  return (
    <div className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
      <h2 className="text-base font-semibold text-slate-900">Bulk import & calibrate</h2>
      <p className="mt-1 text-sm text-slate-500">
        Drop several student PDFs, enter each one's known marks, then run them all through
        the engine and validation at once. Processed one at a time (uses API credit per file).
      </p>

      <DropZone onFiles={addFiles} />

      {rows.length > 0 && (
        <>
          <div className="mt-3 flex items-center gap-3">
            <label className="flex items-center gap-1.5 text-xs text-slate-600">
              <input type="checkbox" checked={showIb} onChange={(e) => setShowIb(e.target.checked)} />
              Include IB moderated marks
            </label>
            <span className="text-xs text-slate-400">
              {rows.length} file{rows.length === 1 ? '' : 's'}
            </span>
          </div>

          <div className="mt-3 overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-slate-200 text-left text-slate-500">
                  <th className="py-2 pr-3">Student / file</th>
                  <th className="py-2 pr-3">Course</th>
                  {CRITERIA_META.map((c) => (
                    <th key={c.k} className="py-2 pr-2 text-center">
                      {c.k}
                    </th>
                  ))}
                  {showIb &&
                    CRITERIA_META.map((c) => (
                      <th key={`ib${c.k}`} className="py-2 pr-2 text-center text-slate-400">
                        {c.k}·IB
                      </th>
                    ))}
                  <th className="py-2">Status</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={row.id} className="border-b border-slate-100 align-top">
                    <td className="py-2 pr-3">
                      <input
                        value={row.studentName}
                        onChange={(e) => patch(row.id, { studentName: e.target.value })}
                        className="w-40 rounded border border-slate-300 px-2 py-1"
                      />
                    </td>
                    <td className="py-2 pr-3">
                      <select
                        value={`${row.subject}-${row.level}`}
                        onChange={(e) => {
                          const [subject, level] = e.target.value.split('-');
                          patch(row.id, { subject, level });
                        }}
                        className="rounded border border-slate-300 px-1 py-1"
                      >
                        <option value="AA-SL">AA SL</option>
                        <option value="AA-HL">AA HL</option>
                        <option value="AI-SL">AI SL</option>
                        <option value="AI-HL">AI HL</option>
                      </select>
                    </td>
                    {CRITERIA_META.map((c) => (
                      <td key={c.k} className="py-2 pr-2">
                        <MarkInput
                          max={c.max}
                          value={row.teacher[c.k]}
                          onChange={(v) => patch(row.id, { teacher: { ...row.teacher, [c.k]: v } })}
                        />
                      </td>
                    ))}
                    {showIb &&
                      CRITERIA_META.map((c) => (
                        <td key={`ib${c.k}`} className="py-2 pr-2">
                          <MarkInput
                            max={c.max}
                            value={row.ib[c.k]}
                            onChange={(v) => patch(row.id, { ib: { ...row.ib, [c.k]: v } })}
                          />
                        </td>
                      ))}
                    <td className="py-2">
                      <RowStatus row={row} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <button
            type="button"
            onClick={runBatch}
            disabled={running || pending === 0}
            className="mt-4 rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-40"
          >
            {running ? 'Running batch…' : `Run batch (${pending})`}
          </button>
        </>
      )}
    </div>
  );
}

function MarkInput({ max, value, onChange }) {
  return (
    <input
      type="number"
      min="0"
      max={max}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="w-11 rounded border border-slate-300 px-1 py-1 text-center"
    />
  );
}

function RowStatus({ row }) {
  if (row.status === 'running') return <span className="text-slate-500">scoring…</span>;
  if (row.status === 'error')
    return <span className="text-red-600" title={row.error}>error</span>;
  if (row.status === 'done') {
    const agree = (a) => a === 'exact' || a === 'within_range';
    const near = (a) => a === 'within_1';
    const dots = row.result
      .map((c) => (agree(c.agreement) ? '🟢' : near(c.agreement) ? '🟡' : c.agreement ? '🔴' : '⚪'))
      .join('');
    return <span title="A B C D E agreement">{dots}</span>;
  }
  return <span className="text-slate-400">ready</span>;
}

function DropZone({ onFiles }) {
  const [over, setOver] = useState(false);
  return (
    <label
      onDragOver={(e) => {
        e.preventDefault();
        setOver(true);
      }}
      onDragLeave={() => setOver(false)}
      onDrop={(e) => {
        e.preventDefault();
        setOver(false);
        onFiles(e.dataTransfer.files);
      }}
      className={`mt-3 flex cursor-pointer flex-col items-center justify-center rounded-md border-2 border-dashed px-4 py-6 text-center text-sm transition ${
        over ? 'border-slate-500 bg-slate-50' : 'border-slate-300 hover:border-slate-400'
      }`}
    >
      <input
        type="file"
        accept="application/pdf,.pdf"
        multiple
        className="hidden"
        onChange={(e) => onFiles(e.target.files)}
      />
      <span className="font-medium text-slate-700">Click to choose PDFs</span>
      <span className="text-xs text-slate-400">or drag &amp; drop several at once</span>
    </label>
  );
}

function filled(marks) {
  const out = {};
  for (const [k, v] of Object.entries(marks)) {
    if (v !== '' && v !== null && v !== undefined) out[k] = Number(v);
  }
  return out;
}
