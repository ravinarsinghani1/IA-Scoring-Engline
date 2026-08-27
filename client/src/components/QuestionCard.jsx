// Shared question rendering — used by QuestionBankView (single question) and
// PaperBuilderView (a full paper, one card per question). Two view modes,
// switched by the parent via a single toggle above the list (ViewModeToggle):
//   'question'    — prompt only, clean and printable, nothing else on the page
//                    competing for attention (was: prompt + a grey mark-scheme
//                    box under every single part, all mixed together).
//   'markscheme'  — marks/annotations only, one clear block per part, ending
//                    in the question's Total line.
// A single global toggle (not per-question) keeps a multi-question paper
// scrolling as one consistent pass, matching how a teacher actually reads it
// (all questions, then all mark schemes, or vice versa — not interleaved).

import MathText from './MathText.jsx';

export function ViewModeToggle({ mode, onChange }) {
  return (
    <div className="inline-flex rounded-md border border-slate-300 bg-white p-0.5 text-sm">
      {[['question', 'Question'], ['markscheme', 'Mark scheme']].map(([value, label]) => (
        <button
          key={value}
          type="button"
          onClick={() => onChange(value)}
          className={`rounded px-3 py-1.5 font-medium transition ${
            mode === value ? 'bg-slate-900 text-white' : 'text-slate-600 hover:bg-slate-100'
          }`}
        >
          {label}
        </button>
      ))}
    </div>
  );
}

function MarkLines({ lines = [] }) {
  return (
    <div className="space-y-1">
      {lines.map((l, i) => (
        <div key={i} className="flex gap-2 text-sm">
          <span className="w-14 shrink-0 rounded bg-slate-200 px-1.5 py-0.5 text-center font-mono text-xs font-semibold text-slate-600">
            {l.annotation}
          </span>
          <MathText text={l.text} className="text-slate-600" />
        </div>
      ))}
    </div>
  );
}

function PartMarkScheme({ part }) {
  return (
    <div className="rounded-md bg-slate-50 p-3">
      {Array.isArray(part.alternativeMethods) ? (
        <div className="space-y-3">
          {part.alternativeMethods.map((m, mi) => (
            <div key={mi}>
              <div className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-500">{m.label}</div>
              <MarkLines lines={m.lines} />
            </div>
          ))}
        </div>
      ) : (
        <MarkLines lines={part.markSchemeLines} />
      )}
      {part.allocationLine && (
        <div className="mt-2 border-t border-slate-200 pt-2 text-xs italic text-slate-500">{part.allocationLine}</div>
      )}
    </div>
  );
}

/** One question, in either 'question' or 'markscheme' mode. */
export function QuestionCard({ question: q, mode, headerExtra, onRemove }) {
  return (
    <div className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
      <div className="mb-4 flex flex-wrap items-center gap-2 border-b border-slate-100 pb-3 text-xs text-slate-500">
        <span className="text-sm font-semibold text-slate-800">
          Question {q.number ?? ''}
        </span>
        {q.course && <Tag>{q.course} {q.level}</Tag>}
        {q.paper && <Tag>{q.paper}</Tag>}
        {typeof q.calculatorAllowed === 'boolean' && <Tag>{q.calculatorAllowed ? 'GDC' : 'No calculator'}</Tag>}
        {q.difficultyPosition && <Tag>incline: {q.difficultyPosition}</Tag>}
        <Tag>{q.totalMarks} marks</Tag>
        {q.custom && <Tag className="border-indigo-200 bg-indigo-50 text-indigo-700">Custom</Tag>}
        <span className="ml-auto flex items-center gap-3">
          {headerExtra}
          {onRemove && (
            <button
              type="button"
              onClick={onRemove}
              className="text-xs font-medium text-red-500 hover:text-red-700"
            >
              Remove
            </button>
          )}
        </span>
      </div>

      <div className="space-y-5">
        {(q.parts ?? []).map((part, i) => (
          <div key={i}>
            <div className="mb-1.5 flex items-baseline gap-2">
              <span className="text-sm font-semibold text-slate-800">{part.label}</span>
              {part.commandTerm && <span className="text-xs text-slate-400">[{part.commandTerm}]</span>}
              <span className="ml-auto shrink-0 text-xs font-medium text-slate-500">
                {part.marks} {part.marks === 1 ? 'mark' : 'marks'}
              </span>
            </div>
            {mode === 'question' ? (
              <MathText text={part.prompt} className="text-sm leading-relaxed text-slate-800" />
            ) : (
              <PartMarkScheme part={part} />
            )}
          </div>
        ))}
      </div>

      {mode === 'markscheme' && q.totalLine && (
        <div className="mt-4 border-t border-slate-100 pt-3 text-sm font-semibold text-slate-700">
          {q.totalLine}
        </div>
      )}
    </div>
  );
}

function Tag({ children, className = '' }) {
  return (
    <span className={`rounded-full border border-slate-200 bg-slate-50 px-2 py-0.5 ${className}`}>
      {children}
    </span>
  );
}
