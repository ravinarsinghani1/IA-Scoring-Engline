// Small mode switcher for the "Question bank" tab: a single question, or a
// full assembled paper. Kept as its own component rather than folding the
// toggle into Workspace.jsx, since Workspace already carries the
// scoring/validation/question-bank top-level switch — this is a second,
// nested level specific to this one tab.

import { useState } from 'react';
import QuestionBankView from './QuestionBankView.jsx';
import PaperBuilderView from './PaperBuilderView.jsx';

export default function QuestionBankHome() {
  const [mode, setMode] = useState('question'); // 'question' | 'paper'

  return (
    <div>
      <div className="mb-6 flex items-center gap-4">
        {/* The wordmark IS the home link — no separate "Home" tab. Clicking
            it always returns to this tab's default view (single-question
            generation), the same way a site logo returns to its front page. */}
        <button
          type="button"
          onClick={() => setMode('question')}
          className="text-base font-bold tracking-tight text-emerald-800 hover:text-emerald-700"
        >
          Saaryavi
        </button>
        <div className="flex gap-2">
          <ModeTab active={mode === 'question'} onClick={() => setMode('question')}>
            Single question
          </ModeTab>
          <ModeTab active={mode === 'paper'} onClick={() => setMode('paper')}>
            Build a paper
          </ModeTab>
        </div>
      </div>

      {mode === 'question' ? <QuestionBankView /> : <PaperBuilderView />}
    </div>
  );
}

function ModeTab({ active, onClick, children }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-md px-3 py-1.5 text-sm font-medium transition ${
        active ? 'bg-slate-900 text-white' : 'border border-slate-300 text-slate-600 hover:bg-slate-100'
      }`}
    >
      {children}
    </button>
  );
}
