// Thin API client. All requests go to the Express backend (proxied via Vite in
// dev). The frontend never talks to the Claude API directly.

// The auth layer registers a getter here so every request carries the current
// Supabase access token. Kept as an injected function (rather than importing the
// supabase client here) to avoid a circular dependency and keep api.js dumb.
let accessTokenGetter = async () => null;
export function setAccessTokenGetter(fn) {
  accessTokenGetter = fn;
}

async function authHeaders(base = {}) {
  const token = await accessTokenGetter();
  return token ? { ...base, Authorization: `Bearer ${token}` } : base;
}

async function request(path, options = {}) {
  const res = await fetch(`/api${path}`, {
    ...options,
    headers: await authHeaders({ 'Content-Type': 'application/json', ...(options.headers || {}) }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(data.error || `Request failed (${res.status})`);
  }
  return data;
}

export const api = {
  // Auth / profile
  me: () => request('/auth/me'),
  bootstrap: () => request('/auth/bootstrap', { method: 'POST' }),
  setRole: (role, subjects) =>
    request('/auth/role', { method: 'POST', body: JSON.stringify({ role, subjects }) }),

  listFolders: () => request('/folders'),
  createFolder: (name) =>
    request('/folders', { method: 'POST', body: JSON.stringify({ name }) }),
  listExplorations: (folderId) =>
    request(`/explorations${folderId ? `?folderId=${encodeURIComponent(folderId)}` : ''}`),
  getExploration: (id) => request(`/explorations/${id}`),
  createExploration: (body) =>
    request('/explorations', { method: 'POST', body: JSON.stringify(body) }),
  submitDraft: (explorationId, rawText) =>
    request(`/explorations/${explorationId}/drafts`, {
      method: 'POST',
      body: JSON.stringify({ rawText }),
    }),
  // Uploads a PDF as a draft (multipart). The browser sets the multipart
  // boundary, so we must NOT set Content-Type ourselves.
  submitDraftFile: async (explorationId, file) => {
    const form = new FormData();
    form.append('file', file);
    const res = await fetch(`/api/explorations/${explorationId}/drafts`, {
      method: 'POST',
      body: form,
      headers: await authHeaders(), // no Content-Type: browser sets multipart boundary
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || `Upload failed (${res.status})`);
    return data;
  },
  recordAuthenticity: (draftId, similarityScore, aiLabelScore) =>
    request(`/drafts/${draftId}/authenticity`, {
      method: 'POST',
      body: JSON.stringify({ similarityScore, aiLabelScore }),
    }),
  // Scores a draft with Claude. Returns 409 (thrown as an error) if the
  // authenticity gate has not passed, or 503 if no API key is configured.
  scoreDraft: (draftId) => request(`/drafts/${draftId}/score`, { method: 'POST' }),
  getScores: (draftId) => request(`/drafts/${draftId}/scores`),
  // Originality coach — integrity coaching beyond Turnitin. Needs an API key.
  runOriginality: (draftId) => request(`/drafts/${draftId}/originality`, { method: 'POST' }),
  // Web-source similarity check (public web; complements Turnitin). Needs a key.
  runSimilarity: (draftId) => request(`/drafts/${draftId}/similarity`, { method: 'POST' }),
  // AI-authorship advisory (teacher-facing, no verdict). Needs a key.
  runAuthorshipAdvisory: (draftId) =>
    request(`/drafts/${draftId}/authorship-advisory`, { method: 'POST' }),

  // Validation harness
  runValidation: (explorationId, teacherMarks, ibMarks, draftId) =>
    request(`/validation/explorations/${explorationId}`, {
      method: 'POST',
      body: JSON.stringify({ teacherMarks, ibMarks, draftId }),
    }),
  getValidation: (explorationId) => request(`/validation/explorations/${explorationId}`),
  getValidationSummary: () => request('/validation/summary'),
};
