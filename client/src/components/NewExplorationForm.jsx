import { useState } from 'react';
import { api } from '../api.js';

export default function NewExplorationForm({ onCreated, onError }) {
  const [studentName, setStudentName] = useState('');
  const [studentId, setStudentId] = useState('');
  const [level, setLevel] = useState('SL');
  const [busy, setBusy] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    if (!studentName.trim()) return;
    setBusy(true);
    onError(null);
    try {
      const created = await api.createExploration({
        studentName: studentName.trim(),
        studentId: studentId.trim() || undefined,
        subject: 'AI',
        level,
      });
      setStudentName('');
      setStudentId('');
      setLevel('SL');
      onCreated(created);
    } catch (err) {
      onError(err.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <form
      onSubmit={submit}
      className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm"
    >
      <h2 className="mb-3 text-sm font-semibold text-slate-700">New exploration</h2>

      <label className="mb-1 block text-xs font-medium text-slate-500">Student name</label>
      <input
        value={studentName}
        onChange={(e) => setStudentName(e.target.value)}
        placeholder="e.g. Priya Sharma"
        className="mb-3 w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-slate-400 focus:outline-none"
      />

      <label className="mb-1 block text-xs font-medium text-slate-500">
        Student ID <span className="text-slate-400">(optional)</span>
      </label>
      <input
        value={studentId}
        onChange={(e) => setStudentId(e.target.value)}
        placeholder="e.g. 0012345"
        className="mb-3 w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-slate-400 focus:outline-none"
      />

      <label className="mb-1 block text-xs font-medium text-slate-500">Level</label>
      <div className="mb-4 flex gap-2">
        {['SL', 'HL'].map((lvl) => (
          <button
            type="button"
            key={lvl}
            onClick={() => setLevel(lvl)}
            className={`flex-1 rounded-md border px-3 py-1.5 text-sm font-medium transition ${
              level === lvl
                ? 'border-slate-800 bg-slate-800 text-white'
                : 'border-slate-300 bg-white text-slate-600 hover:border-slate-400'
            }`}
          >
            Mathematics AI {lvl}
          </button>
        ))}
      </div>

      <button
        type="submit"
        disabled={busy || !studentName.trim()}
        className="w-full rounded-md bg-slate-900 px-3 py-2 text-sm font-medium text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-40"
      >
        {busy ? 'Creating…' : 'Create exploration'}
      </button>
    </form>
  );
}
