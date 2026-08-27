// API client for the Question Bank backend — a SEPARATE host from api.js.
//
// Why separate: generation can run for minutes over Server-Sent Events, which
// the main Vercel-hosted API cannot hold open (60s serverless timeout). This
// one route group is served from a long-running host instead (see
// server/fly.toml / the Render deploy). Everything else in the app still goes
// through api.js, same-origin, unaffected.
//
// Base URL comes from VITE_QUESTION_BANK_API_URL (see client/.env.example).

import { getAccessToken } from './api.js';

const BASE_URL = (import.meta.env.VITE_QUESTION_BANK_API_URL || '').replace(/\/$/, '');

async function authHeaders(base = {}) {
  const token = await getAccessToken();
  return token ? { ...base, Authorization: `Bearer ${token}` } : base;
}

async function get(path) {
  const res = await fetch(`${BASE_URL}/api/question-bank${path}`, {
    headers: await authHeaders(),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `Request failed (${res.status})`);
  return data;
}

/**
 * POST `request` to an SSE endpoint and resolve with the `done` payload,
 * forwarding `progress` events to `onProgress` as they arrive. Shared by
 * `generate` (one question) and `buildPaper` (a full paper) — both routes use
 * the exact same lifecycle-event contract (see routes/questionBank.js).
 */
async function postSSE(path, request, { onProgress, signal } = {}) {
  const res = await fetch(`${BASE_URL}/api/question-bank${path}`, {
    method: 'POST',
    headers: await authHeaders({ 'Content-Type': 'application/json' }),
    body: JSON.stringify(request),
    signal,
  });

  // A malformed request is answered as plain 400 JSON BEFORE the stream
  // opens (see routes/questionBank.js) — never SSE in that case.
  const contentType = res.headers.get('content-type') || '';
  if (!contentType.includes('text/event-stream')) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.error || `Request failed (${res.status})`);
  }
  if (!res.ok || !res.body) {
    throw new Error(`Request failed (${res.status})`);
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });

    // SSE events are separated by a blank line.
    let sepIndex;
    while ((sepIndex = buffer.indexOf('\n\n')) !== -1) {
      const block = buffer.slice(0, sepIndex);
      buffer = buffer.slice(sepIndex + 2);
      const result = handleEventBlock(block, onProgress);
      if (result) return result; // 'done' resolves, 'error' throws inside
    }
  }

  throw new Error('Stream ended without a result.');
}

export const questionBankApi = {
  getTaxonomy: (course, level) =>
    get(`/taxonomy?course=${encodeURIComponent(course)}&level=${encodeURIComponent(level)}`),
  getWeighting: (course, level) =>
    get(`/weighting?course=${encodeURIComponent(course)}&level=${encodeURIComponent(level)}`),

  /**
   * Generate one validated question, streamed over SSE.
   *
   * @param {object} request  { course, level, paper, subtopicCodes, difficultyPosition?, targetMarks? }
   * @param {object} [opts]
   * @param {(event: {phase:string, attempt?:number, checks?:object[]}) => void} [opts.onProgress]
   * @param {AbortSignal} [opts.signal]  disconnect aborts the in-flight server-side work too
   * @returns {Promise<{ question: object, warnings: object[], meta?: object }>}
   */
  generate: (request, opts) => postSSE('/generate', request, opts),

  /**
   * Build a full worksheet/paper of multiple independently-validated
   * questions, streamed over SSE. No Section A/B — a flat, ordered list.
   *
   * @param {object} request  { course, level, paper, difficultyPosition?,
   *          examSimulation?, targetMarks? (required unless examSimulation),
   *          subtopicCodes? (pool to draw from; defaults to the whole course/level) }
   * @param {object} [opts]
   * @param {(event: object) => void} [opts.onProgress]  includes 'plan' and
   *          'question-start' phases in addition to generate's own phases,
   *          each tagged with questionIndex/questionCount once inside a slot
   * @param {AbortSignal} [opts.signal]
   * @returns {Promise<{ paper: object, warnings: object[], meta?: object }>}
   */
  buildPaper: (request, opts) => postSSE('/generate-paper', request, opts),

  /**
   * Export an already-generated paper or single question as a downloadable
   * file. Not SSE — this is pure formatting on already-validated content, a
   * normal request/response. Triggers a browser download directly; does not
   * return the blob to the caller (nothing else in the app needs the bytes).
   *
   * @param {'pdf'|'docx'} format
   * @param {{paper?: object, question?: object}} content  exactly one of these
   * @param {object} [options]  see server export.js's ExportOptions typedef
   *          (includeMarkScheme, spacing, header)
   */
  async exportPaper(format, content, options = {}) {
    const res = await fetch(`${BASE_URL}/api/question-bank/export`, {
      method: 'POST',
      headers: await authHeaders({ 'Content-Type': 'application/json' }),
      body: JSON.stringify({ format, ...content, options }),
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      throw new Error(data.error || `Export failed (${res.status})`);
    }
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `question-bank.${format}`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  },
};

/** Parses one SSE event block. Returns the resolved value on `done`, throws on `error`, else undefined. */
function handleEventBlock(block, onProgress) {
  let eventType = 'message';
  const dataLines = [];
  for (const line of block.split('\n')) {
    if (line.startsWith(':')) continue; // heartbeat comment
    if (line.startsWith('event:')) eventType = line.slice(6).trim();
    else if (line.startsWith('data:')) dataLines.push(line.slice(5).trim());
  }
  if (dataLines.length === 0) return undefined;

  let data;
  try {
    data = JSON.parse(dataLines.join('\n'));
  } catch {
    return undefined;
  }

  if (eventType === 'progress') {
    if (typeof onProgress === 'function') onProgress(data);
    return undefined;
  }
  if (eventType === 'done') return data;
  if (eventType === 'error') {
    const err = new Error(data.message || 'Generation failed.');
    err.status = data.status;
    err.aborted = data.aborted;
    throw err;
  }
  return undefined;
}
