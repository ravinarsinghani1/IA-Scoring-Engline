// AI-authorship advisory (teacher-facing).
//
// This is deliberately NOT an AI detector. It does not output a percentage or a
// yes/no "this was AI-written" verdict — those are unreliable and can wrongly
// brand a student (false positives fall hardest on second-language writers). It
// instead flags SPECIFIC passages that are worth a good-faith conversation with
// the student about authorship, states the observable signal, and suggests how
// to check (ask them to explain / reproduce the work). The teacher judges.

import { getAnthropicClient, SCORING_MODEL } from '../anthropicClient.js';
import { buildExplorationContent } from '../promptContent.js';

const SYSTEM_PROMPT = `You help an IB teacher decide which passages of a student's Mathematics exploration are worth a good-faith conversation about authorship. You are a conversation-starter for a human, not a detector.

ABSOLUTE RULES:
- You are NOT an AI-detection tool. Do NOT state or imply that any passage "was AI-generated", and do NOT output any probability, percentage, or yes/no authorship verdict.
- These are SIGNALS worth a human check, never evidence of misconduct. The student may well have written every word.
- False positives are common — especially for students writing in a second language, and for naturally formal or polished writers. Polished, fluent, or formal writing is NOT itself a reason to flag.
- Never recommend accusing the student. Recommend a good-faith check: ask them to explain a step in their own words, reproduce a derivation, or walk through their reasoning.

What to flag (only genuine, observable signals):
- A passage whose style, register, or sophistication shifts abruptly from the surrounding student writing.
- A passage that reads as generic/boilerplate and is disconnected from the student's own specific work, data, or aim.
- A claim of understanding or a technique that is asserted but not evidenced anywhere else in the exploration.
Do not flag standard mathematical notation, correct formulae, or ordinary technical phrasing.

For each flagged passage give: the quote, the OBSERVABLE signal (what specifically stands out, in neutral terms), and a concrete CHECK the teacher can do with the student. Set "overall" to your honest qualitative read (never a score).`;

const schema = {
  type: 'object',
  additionalProperties: false,
  properties: {
    overall: {
      type: 'string',
      enum: ['nothing_notable', 'worth_a_conversation', 'several_worth_a_conversation'],
    },
    summary: { type: 'string' },
    flags: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        properties: {
          passage: { type: 'string' }, // short quote
          signal: { type: 'string' }, // the observable reason it stands out
          check: { type: 'string' }, // good-faith way to check with the student
        },
        required: ['passage', 'signal', 'check'],
      },
    },
  },
  required: ['overall', 'summary', 'flags'],
};

export async function runAuthorshipAdvisory({ rawText, level, pdfPath = null }) {
  const client = getAnthropicClient();

  const instructions = `This is a Mathematics AI ${level} exploration. Produce a passage-level authorship advisory for the teacher: which passages (if any) are worth a good-faith conversation with the student about authorship, and how to check. Remember: no percentages, no verdicts — signals and checks only.`;

  const userContent = buildExplorationContent({
    pdfPath,
    rawText,
    instructions,
    pdfSuffix: "The student's full exploration is the attached PDF.",
  });

  const response = await client.messages.create({
    model: SCORING_MODEL,
    max_tokens: 16000,
    thinking: { type: 'adaptive' },
    output_config: { effort: 'high', format: { type: 'json_schema', schema } },
    system: SYSTEM_PROMPT,
    messages: [{ role: 'user', content: userContent }],
  });

  const textBlock = response.content.find((b) => b.type === 'text');
  if (!textBlock) {
    const err = new Error('Advisory model returned no structured output.');
    err.status = 502;
    err.expose = true;
    throw err;
  }
  return JSON.parse(textBlock.text);
}
