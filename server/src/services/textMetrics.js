// Text metrics for a draft. IB explorations are capped around 12–20 pages;
// word count is the reliable signal, page_count is an estimate for display only.

const WORDS_PER_PAGE = 500; // rough estimate; refined later when we parse real PDFs

export function wordCount(text) {
  if (!text) return 0;
  const matches = text.trim().match(/\S+/g);
  return matches ? matches.length : 0;
}

export function estimatePageCount(text) {
  const words = wordCount(text);
  if (words === 0) return 0;
  return Math.max(1, Math.round(words / WORDS_PER_PAGE));
}
