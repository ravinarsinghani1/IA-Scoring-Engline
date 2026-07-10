import { useState } from 'react';
import { api } from '../api.js';

const COURSES = [
  { key: 'AA-SL', subject: 'AA', level: 'SL', label: 'Mathematics AA SL' },
  { key: 'AA-HL', subject: 'AA', level: 'HL', label: 'Mathematics AA HL' },
  { key: 'AI-SL', subject: 'AI', level: 'SL', label: 'Mathematics AI SL' },
  { key: 'AI-HL', subject: 'AI', level: 'HL', label: 'Mathematics AI HL' },
];

export default function NewExplorationForm({ folderId = null, onCreated, onError }) {
  const [studentName, setStudentName] = useState('');
  const [studentId, setStudentId] = useState('');
  const [course, setCourse] = useState('AI-SL');
  const [busy, setBusy] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    if (!studentName.trim()) return;
    const c = COURSES.find((x) => x.key === course);
    setBusy(true);
    onError(null);
    try {
      const created = await api.createExploration({
        studentName: studentName.trim(),
        studentId: studentId.trim() || undefined,
        subject: c.subject,
        level: c.level,
        folderId,
      });
      setStudentName('');
      setStudentId('');
      setCourse('AI-SL');
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

      <label className="mb-1 block text-xs font-medium text-slate-500">Course</label>
      <div className="mb-4 grid grid-cols-2 gap-2">
        {COURSES.map((c) => (
          <button
            type="button"
            key={c.key}
            onClick={() => setCourse(c.key)}
            className={`rounded-md border px-2 py-1.5 text-sm font-medium transition ${
              course === c.key
                ? 'border-slate-800 bg-slate-800 text-white'
                : 'border-slate-300 bg-white text-slate-600 hover:border-slate-400'
            }`}
          >
            {c.label}
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
