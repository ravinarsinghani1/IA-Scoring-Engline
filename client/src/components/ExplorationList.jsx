export default function ExplorationList({ explorations, selectedId, onSelect }) {
  return (
    <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
      <h2 className="mb-3 text-sm font-semibold text-slate-700">
        Explorations
        <span className="ml-1 text-xs font-normal text-slate-400">
          ({explorations.length})
        </span>
      </h2>

      {explorations.length === 0 ? (
        <p className="text-sm text-slate-400">None yet.</p>
      ) : (
        <ul className="space-y-1">
          {explorations.map((exp) => {
            const active = exp.id === selectedId;
            return (
              <li key={exp.id}>
                <button
                  onClick={() => onSelect(exp.id)}
                  className={`flex w-full items-center justify-between rounded-md px-3 py-2 text-left text-sm transition ${
                    active
                      ? 'bg-slate-100 font-medium text-slate-900'
                      : 'text-slate-600 hover:bg-slate-50'
                  }`}
                >
                  <span className="truncate">{exp.student_name}</span>
                  <span className="ml-2 shrink-0 text-xs text-slate-400">
                    {exp.subject} {exp.level} · {exp.draft_count} draft
                    {exp.draft_count === 1 ? '' : 's'}
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
