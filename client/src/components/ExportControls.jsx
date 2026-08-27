// Shared export UI — used from both the single-question result (QuestionBankView)
// and the assembled-paper result (PaperBuilderView), since both export the
// same way (see server export.js — a single question is just wrapped as a
// 1-question paper server-side).

import { useState } from 'react';
import { questionBankApi } from '../questionBankApi.js';

export default function ExportControls({ content }) {
  const [includeMarkScheme, setIncludeMarkScheme] = useState(false);
  const [spacing, setSpacing] = useState('structured');
  const [showHeader, setShowHeader] = useState(false);
  const [header, setHeader] = useState({ schoolName: '', teacherName: '', className: '', date: '', instructions: '' });
  const [busy, setBusy] = useState(null); // null | 'pdf' | 'docx'
  const [error, setError] = useState(null);

  const doExport = async (format) => {
    setError(null);
    setBusy(format);
    try {
      const cleanHeader = Object.fromEntries(
        Object.entries(header).filter(([, v]) => v.trim() !== '')
      );
      await questionBankApi.exportPaper(format, content, {
        includeMarkScheme,
        spacing,
        header: cleanHeader,
      });
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
      <h3 className="mb-3 text-sm font-semibold text-slate-700">Export</h3>

      {error && (
        <div className="mb-3 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
          {error}
        </div>
      )}

      <label className="mb-3 flex items-center gap-2 text-xs text-slate-600">
        <input
          type="checkbox"
          checked={includeMarkScheme}
          onChange={(e) => setIncludeMarkScheme(e.target.checked)}
        />
        Include mark scheme (answers) — otherwise, blank answer space is left instead
      </label>

      {!includeMarkScheme && (
        <div className="mb-3">
          <label className="mb-1 block text-xs font-medium text-slate-500">Answer space</label>
          <div className="flex gap-2">
            <SpacingButton active={spacing === 'structured'} onClick={() => setSpacing('structured')}>
              Structured (ruled lines)
            </SpacingButton>
            <SpacingButton active={spacing === 'unstructured'} onClick={() => setSpacing('unstructured')}>
              Unstructured (blank gap)
            </SpacingButton>
          </div>
        </div>
      )}

      <button
        type="button"
        onClick={() => setShowHeader((v) => !v)}
        className="mb-2 text-xs font-medium text-slate-500 underline decoration-dotted"
      >
        {showHeader ? 'Hide' : 'Add'} school/teacher header (optional)
      </button>

      {showHeader && (
        <div className="mb-3 space-y-2 rounded-md border border-slate-200 p-3">
          {[
            ['schoolName', 'School name'],
            ['teacherName', 'Teacher name'],
            ['className', 'Class'],
            ['date', 'Date'],
          ].map(([key, label]) => (
            <input
              key={key}
              value={header[key]}
              onChange={(e) => setHeader((h) => ({ ...h, [key]: e.target.value }))}
              placeholder={label}
              className="w-full rounded-md border border-slate-300 px-2 py-1.5 text-xs focus:border-slate-400 focus:outline-none"
            />
          ))}
          <textarea
            value={header.instructions}
            onChange={(e) => setHeader((h) => ({ ...h, instructions: e.target.value }))}
            placeholder="Instructions (optional) — e.g. 'Answer all questions. Show all working.'"
            rows={2}
            className="w-full rounded-md border border-slate-300 px-2 py-1.5 text-xs focus:border-slate-400 focus:outline-none"
          />
        </div>
      )}

      <div className="flex gap-2">
        <button
          type="button"
          disabled={busy !== null}
          onClick={() => doExport('pdf')}
          className="flex-1 rounded-md bg-slate-900 px-3 py-2 text-sm font-medium text-white hover:bg-slate-800 disabled:opacity-50"
        >
          {busy === 'pdf' ? 'Exporting…' : 'Download PDF'}
        </button>
        <button
          type="button"
          disabled={busy !== null}
          onClick={() => doExport('docx')}
          className="flex-1 rounded-md border border-slate-300 px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-100 disabled:opacity-50"
        >
          {busy === 'docx' ? 'Exporting…' : 'Download Word'}
        </button>
      </div>

      <p className="mt-2 text-xs text-slate-400">
        Math is exported as written (e.g. plain LaTeX-style text), matching what you see on screen — not typeset symbols.
      </p>
    </div>
  );
}

function SpacingButton({ active, onClick, children }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex-1 rounded-md px-2 py-1.5 text-xs font-medium transition ${
        active ? 'bg-slate-900 text-white' : 'border border-slate-300 text-slate-600 hover:bg-slate-100'
      }`}
    >
      {children}
    </button>
  );
}
