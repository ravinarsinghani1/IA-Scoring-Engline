// Renders question/mark-scheme text that mixes plain prose with LaTeX math
// (e.g. "Find $\int_0^1 x^2\,dx$." or a standalone "$$y = mx + c$$" line),
// which is exactly what generate.js's model output contains (see export.js's
// FLAGGED note — the model is prompted to use $...$ / $$...$$ delimiters,
// and until now every surface just printed that source literally).
//
// Split on $$...$$ first (display math), then $...$ within the remainder
// (inline math), and hand each math segment to KaTeX. A LaTeX segment KaTeX
// can't parse (the model occasionally produces slightly malformed source)
// falls back to plain monospace text instead of throwing and blanking the
// whole question — a readability bug is much worse than a blemish.
//
// Text segments preserve line breaks (teachers' prompts rely on them for
// listing parts/sub-steps), so this is also the fix for "cramped" question
// text — no separate whitespace-pre-wrap wrapper needed anymore.

import katex from 'katex';

// $$...$$ (display) or $...$ (inline), non-greedy, no unescaped '$' inside.
const MATH_RE = /\$\$([^$]+?)\$\$|\$([^$\n]+?)\$/g;

function renderKatex(latex, displayMode) {
  try {
    return katex.renderToString(latex, { throwOnError: false, displayMode, strict: false });
  } catch {
    return null;
  }
}

function segmentsOf(text) {
  const parts = [];
  let last = 0;
  let m;
  MATH_RE.lastIndex = 0;
  while ((m = MATH_RE.exec(text)) !== null) {
    if (m.index > last) parts.push({ type: 'text', value: text.slice(last, m.index) });
    if (m[1] !== undefined) parts.push({ type: 'math', value: m[1], display: true });
    else parts.push({ type: 'math', value: m[2], display: false });
    last = MATH_RE.lastIndex;
  }
  if (last < text.length) parts.push({ type: 'text', value: text.slice(last) });
  return parts;
}

/**
 * @param {{ text: string, className?: string }} props
 * `text` may be plain prose, or prose mixed with $inline$ / $$display$$ math.
 */
export default function MathText({ text, className = '' }) {
  if (typeof text !== 'string' || text === '') return null;
  const segments = segmentsOf(text);

  // No math at all — the common case for prose-only text — skip KaTeX
  // entirely and just preserve whitespace/line breaks.
  if (segments.length === 1 && segments[0].type === 'text') {
    return <span className={`whitespace-pre-wrap ${className}`}>{text}</span>;
  }

  return (
    <span className={`whitespace-pre-wrap ${className}`}>
      {segments.map((seg, i) => {
        if (seg.type === 'text') return <span key={i}>{seg.value}</span>;
        const html = renderKatex(seg.value, seg.display);
        if (html === null) {
          // Malformed LaTeX — show the raw source rather than nothing.
          return (
            <span key={i} className="font-mono text-[0.9em] text-slate-500">
              {seg.display ? `$$${seg.value}$$` : `$${seg.value}$`}
            </span>
          );
        }
        return seg.display ? (
          <span key={i} className="my-1 block" dangerouslySetInnerHTML={{ __html: html }} />
        ) : (
          <span key={i} dangerouslySetInnerHTML={{ __html: html }} />
        );
      })}
    </span>
  );
}
