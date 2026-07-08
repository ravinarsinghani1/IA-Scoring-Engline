// Web-source similarity check.
//
// Uses Claude with the web_search server tool to find passages in the
// exploration that match publicly-available sources, with links, so the student
// can cite or genuinely rewrite them. This COMPLEMENTS Turnitin — it only sees
// the public web, not Turnitin's private student-paper / journal database — and
// it never advises how to evade a detector.
//
// Web search is a server tool that runs a multi-step loop; if it hits the
// server-side iteration cap the response comes back with stop_reason
// "pause_turn", which we continue by re-sending the accumulated messages.

import { getAnthropicClient, SCORING_MODEL } from '../anthropicClient.js';
import { buildExplorationContent } from '../promptContent.js';

const SYSTEM_PROMPT = `You are an academic-integrity assistant running a SOURCE-MATCH (similarity) check on an IB Mathematics exploration. Your goal is to find passages in the student's writing that closely match publicly available web sources, so the student can properly CITE them or genuinely REWRITE them in their own words.

How to work:
- Read the exploration and pick out passages that read as if they may be copied or closely paraphrased from a public source: definitions, historical/background prose, standard explanations, or distinctive turns of phrase.
- Use the web_search tool to search for a distinctive phrase from each such passage and check whether a public web page contains matching or near-matching wording.
- Only report a match when you have found a real source with matching/near-matching text. Never invent a URL or a source.

Important boundaries:
- This complements Turnitin; it does NOT reproduce Turnitin's percentage and only covers the public web.
- Do NOT flag standard mathematical notation, common formulae, or ordinary technical phrasing — those are not plagiarism.
- Frame every recommendation as honest improvement: cite the source properly, or genuinely rewrite it in the student's own words with understanding. NEVER suggest ways to reword text to evade a similarity or AI detector.

End your reply with a SINGLE JSON object and nothing after it, exactly this shape:
{"assessment":"none|some|substantial","summary":"1-2 sentence overview","matches":[{"passage":"short quote from the exploration","source_title":"page/source title","source_url":"https://...","match_type":"close-copy|close-paraphrase|common-knowledge","recommendation":"what to do: cite or rewrite, specifically"}]}
If you find no meaningful matches, return "assessment":"none" and an empty "matches" array.`;

export async function runWebSourceCheck({ rawText, level, pdfPath = null }) {
  const client = getAnthropicClient();

  const instructions = `This is a Mathematics AI ${level} exploration. Perform a public-web source-match (similarity) check and report matched passages with their sources.`;

  const userContent = buildExplorationContent({
    pdfPath,
    rawText,
    instructions,
    pdfSuffix: "The student's full exploration is the attached PDF.",
  });

  const messages = [{ role: 'user', content: userContent }];
  const params = {
    model: SCORING_MODEL,
    max_tokens: 16000,
    thinking: { type: 'adaptive' },
    system: SYSTEM_PROMPT,
    tools: [{ type: 'web_search_20260209', name: 'web_search' }],
    messages,
  };

  let response = await client.messages.create(params);

  // Continue the server-tool loop if it paused (web search hit the step cap).
  let guard = 0;
  while (response.stop_reason === 'pause_turn' && guard < 6) {
    messages.push({ role: 'assistant', content: response.content });
    response = await client.messages.create({ ...params, messages });
    guard += 1;
  }

  const text = response.content
    .filter((b) => b.type === 'text')
    .map((b) => b.text)
    .join('\n')
    .trim();

  return parseReport(text);
}

// The model is asked to end with a JSON object; extract and parse it defensively.
function parseReport(text) {
  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  if (start !== -1 && end !== -1 && end > start) {
    try {
      const obj = JSON.parse(text.slice(start, end + 1));
      return {
        assessment: obj.assessment || 'none',
        summary: obj.summary || '',
        matches: Array.isArray(obj.matches) ? obj.matches : [],
      };
    } catch {
      /* fall through */
    }
  }
  // Couldn't parse structured output — surface the model's prose so nothing is lost.
  return { assessment: 'unknown', summary: text.slice(0, 800), matches: [] };
}
