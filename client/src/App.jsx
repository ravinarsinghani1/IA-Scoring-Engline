import { useEffect, useState, useCallback } from 'react';
import { api } from './api.js';
import NewExplorationForm from './components/NewExplorationForm.jsx';
import ExplorationList from './components/ExplorationList.jsx';
import ExplorationDetail from './components/ExplorationDetail.jsx';

export default function App() {
  const [explorations, setExplorations] = useState([]);
  const [selectedId, setSelectedId] = useState(null);
  const [error, setError] = useState(null);

  const refresh = useCallback(async () => {
    try {
      setExplorations(await api.listExplorations());
    } catch (err) {
      setError(err.message);
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const handleCreated = async (created) => {
    await refresh();
    setSelectedId(created.id);
  };

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto max-w-6xl px-6 py-4">
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
      </header>

      <main className="mx-auto max-w-6xl px-6 py-8">
        {error && (
          <div className="mb-4 rounded-md border border-red-200 bg-red-50 px-4 py-2 text-sm text-red-700">
            {error}
          </div>
        )}

        <div className="grid grid-cols-1 gap-8 lg:grid-cols-[340px_1fr]">
          <aside className="space-y-6">
            <NewExplorationForm onCreated={handleCreated} onError={setError} />
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
      </main>
    </div>
  );
}
