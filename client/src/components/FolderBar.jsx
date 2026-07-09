import { useState } from 'react';

// Folder picker for grouping explorations by batch/year. "All explorations"
// shows everything; picking a folder scopes both the list and new explorations.
export default function FolderBar({ folders, selected, onSelect, onCreate }) {
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);

  const create = async (e) => {
    e.preventDefault();
    if (!name.trim()) return;
    setBusy(true);
    try {
      await onCreate(name.trim());
      setName('');
      setCreating(false);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
      <label className="mb-1 block text-xs font-medium text-slate-500">Folder (batch / year)</label>
      <div className="flex gap-2">
        <select
          value={selected}
          onChange={(e) => onSelect(e.target.value)}
          className="flex-1 rounded-md border border-slate-300 px-2 py-2 text-sm focus:border-slate-400 focus:outline-none"
        >
          <option value="all">All explorations</option>
          {folders.map((f) => (
            <option key={f.id} value={String(f.id)}>
              {f.name} ({f.exploration_count})
            </option>
          ))}
        </select>
        <button
          type="button"
          onClick={() => setCreating((v) => !v)}
          className="rounded-md border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-600 transition hover:border-slate-400"
        >
          {creating ? 'Cancel' : '+ New'}
        </button>
      </div>

      {creating && (
        <form onSubmit={create} className="mt-2 flex gap-2">
          <input
            autoFocus
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. Math IA 2024-26"
            className="flex-1 rounded-md border border-slate-300 px-2 py-1.5 text-sm focus:border-slate-400 focus:outline-none"
          />
          <button
            type="submit"
            disabled={busy || !name.trim()}
            className="rounded-md bg-slate-900 px-3 py-1.5 text-sm font-medium text-white transition hover:bg-slate-800 disabled:opacity-40"
          >
            {busy ? 'Creating…' : 'Create'}
          </button>
        </form>
      )}
    </div>
  );
}
