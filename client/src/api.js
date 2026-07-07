// Thin API client. All requests go to the Express backend (proxied via Vite in
// dev). The frontend never talks to the Claude API directly.

async function request(path, options = {}) {
  const res = await fetch(`/api${path}`, {
    headers: { 'Content-Type': 'application/json' },
    ...options,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(data.error || `Request failed (${res.status})`);
  }
  return data;
}

export const api = {
  listExplorations: () => request('/explorations'),
  getExploration: (id) => request(`/explorations/${id}`),
  createExploration: (body) =>
    request('/explorations', { method: 'POST', body: JSON.stringify(body) }),
  submitDraft: (explorationId, rawText) =>
    request(`/explorations/${explorationId}/drafts`, {
      method: 'POST',
      body: JSON.stringify({ rawText }),
    }),
  recordAuthenticity: (draftId, similarityScore, aiLabelScore) =>
    request(`/drafts/${draftId}/authenticity`, {
      method: 'POST',
      body: JSON.stringify({ similarityScore, aiLabelScore }),
    }),
  // Scores a draft with Claude. Returns 409 (thrown as an error) if the
  // authenticity gate has not passed, or 503 if no API key is configured.
  scoreDraft: (draftId) => request(`/drafts/${draftId}/score`, { method: 'POST' }),
  getScores: (draftId) => request(`/drafts/${draftId}/scores`),
};
