// The authenticated teacher workspace — the original single-screen Scoring +
// Validation tool. Unchanged in behaviour from the pre-auth App; it now renders
// only behind RequireAuth. Phase 1 restyles this into the sidebar shell.

import { useEffect, useState, useCallback } from 'react';
import { api } from '../api.js';
import { useAuth } from '../auth/AuthContext.jsx';
import NewExplorationForm from '../components/NewExplorationForm.jsx';
import ExplorationList from '../components/ExplorationList.jsx';
import ExplorationDetail from '../components/ExplorationDetail.jsx';
import ValidationView from '../components/ValidationView.jsx';
import FolderBar from '../components/FolderBar.jsx';

export default function Workspace() {
  const { profile, signOut } = useAuth();
  const [view, setView] = useState('scoring'); // 'scoring' | 'validation'
  const [folders, setFolders] = useState([]);
  const [folder, setFolder] = useState('all'); // 'all' | folder id (string)
  const [explorations, setExplorations] = useState([]);
  const [selectedId, setSelectedId] = useState(null);
  const [error, setError] = useState(null);

  const refresh = useCallback(async () => {
    try {
      setExplorations(await api.listExplorations(folder));
    } catch (err) {
      setError(err.message);
    }
  }, [folder]);

  const loadFolders = useCallback(async () => {
    try {
      setFolders(await api.listFolders());
    } catch (err) {
      setError(err.message);
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  useEffect(() => {
    loadFolders();
  }, [loadFolders]);

  const handleCreated = async (created) => {
    await refresh();
    await loadFolders();
    setSelectedId(created.id);
  };

  const handleCreateFolder = async (name) => {
    const created = await api.createFolder(name);
    await loadFolders();
    setFolder(String(created.id));
    setSelectedId(null);
  };

  const selectFolder = (value) => {
    setFolder(value);
    setSelectedId(null);
  };

  // Numeric folder id when a real folder is selected (else null = ungrouped).
  const folderId = folder !== 'all' ? Number(folder) : null;

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto max-w-6xl px-6 py-4">
          <div className="flex items-start justify-between">
            <div>
              <h1 className="text-lg font-semibold tracking-tight">
                IB Math IA Scoring Engine
                <span className="ml-2 rounded bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-500">
                  Mathematics AI · MVP
                </span>
              </h1>
              <p className="mt-1 text-sm text-slate-500">
                Advisory feedback only — every score is provisional pending the teacher's judgment.
              </p>
            </div>
            <div className="flex items-center gap-3 text-sm text-slate-500">
              <span className="hidden sm:inline">{profile?.email}</span>
              <button
                type="button"
                onClick={signOut}
                className="rounded-md px-3 py-1.5 font-medium text-slate-600 hover:bg-slate-100"
              >
                Sign out
              </button>
            </div>
          </div>
          <nav className="mt-3 flex gap-2">
            <NavTab active={view === 'scoring'} onClick={() => setView('scoring')}>
              Scoring
            </NavTab>
            <NavTab active={view === 'validation'} onClick={() => setView('validation')}>
              Validation harness
            </NavTab>
          </nav>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-6 py-8">
        {error && (
          <div className="mb-4 rounded-md border border-red-200 bg-red-50 px-4 py-2 text-sm text-red-700">
            {error}
          </div>
        )}

        {view === 'scoring' ? (
          <div className="grid grid-cols-1 gap-8 lg:grid-cols-[340px_1fr]">
            <aside className="space-y-6">
              <FolderBar
                folders={folders}
                selected={folder}
                onSelect={selectFolder}
                onCreate={handleCreateFolder}
              />
              <NewExplorationForm
                folderId={folderId}
                onCreated={handleCreated}
                onError={setError}
              />
              <ExplorationList
                explorations={explorations}
                selectedId={selectedId}
                onSelect={setSelectedId}
              />
            </aside>

            <section>
              {selectedId ? (
                <ExplorationDetail
                  explorationId={selectedId}
                  onDraftSubmitted={refresh}
                  onError={setError}
                />
              ) : (
                <div className="flex h-64 items-center justify-center rounded-lg border border-dashed border-slate-300 text-sm text-slate-400">
                  Select an exploration, or create one to get started.
                </div>
              )}
            </section>
          </div>
        ) : (
          <ValidationView
            explorations={explorations}
            onExplorationsChanged={refresh}
            onError={setError}
          />
        )}
      </main>
    </div>
  );
}

function NavTab({ active, onClick, children }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-md px-3 py-1.5 text-sm font-medium transition ${
        active ? 'bg-slate-900 text-white' : 'text-slate-600 hover:bg-slate-100'
      }`}
    >
      {children}
    </button>
  );
}
