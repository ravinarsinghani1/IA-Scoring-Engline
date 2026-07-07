// Originality Coach.
//
// This is the layer Turnitin does NOT provide. Turnitin tells you WHERE text
// matches a source and flags AI-writing; it does not help the student make the
// work genuinely their own. The coach does exactly that — and ONLY that.
//
// Hard ethical rule (enforced in the prompt): every recommendation must move the
// work toward authentic authorship and sound academic practice — cite a source,
// genuinely rewrite with understanding, add the student's own reasoning, show a
// method / data provenance, or remove an unsupported claim. It must NEVER advise
// how to lower an AI-detection or similarity score, disguise copied text, or
// otherwise evade a detector. It does not output an "AI %" — that number comes
// from Turnitin and reproducing it unreliably could wrongly accuse a real student.

import { getAnthropicClient, SCORING_MODEL } from '../anthropicClient.js';
import { buildExplorationContent } from '../promptContent.js';

export const ITEM_CATEGORIES = [
  'missing_citation', // a claim/figure/formula/quote/data that needs a source
  'add_own_analysis', // generic/textbook passage lacking the student's reasoning
  'unsupported_claim', // asserted fact/result with no evidence, method or source
  'patchwriting', // paraphrase that swaps words without genuine understanding
  'over_reliance', // heavy dependence on a single source
  'data_provenance', // data/results whose origin or method isn't documented
  'voice_inconsistency', // abrupt shifts suggesting inserted external text
];

const CHECKLIST_LABELS = [
  'In-text citations present where needed',
  'Bibliography / reference list present and consistent',
  'Data and methods documented (reproducible, own work)',
  'Consistent, genuine authorial voice throughout',
  'Claims supported by evidence, working, or sources',
];

const SYSTEM_PROMPT = `You are an IB academic-integrity and writing mentor helping a student make their Mathematics: Applications and Interpretation exploration genuinely their OWN work.

Context: the student's file has already been through Turnitin, which reports a similarity score, an AI-writing score, and matched sources. Do NOT reproduce those — do not output an AI percentage, a similarity percentage, or a list of matched sources. Your job is the layer Turnitin does not provide: coaching the student toward authentic authorship and sound academic practice.

ABSOLUTE RULE — authenticity through genuine work, never evasion:
Every recommendation you give MUST be one of:
- cite a source properly,
- genuinely rewrite a passage in the student's own words demonstrating real understanding,
- add the student's own reasoning, analysis, testing, or reflection,
- show a method, calculation, or the provenance of data,
- or remove an unsupported claim.
You must NEVER advise anything whose purpose is to lower an AI-detection or similarity score, to disguise copied or machine-generated text, or to make writing "pass" a detector. If a passage reads as copied or machine-generated, the remedy is that the student genuinely authors and understands it — not that they conceal it. Refuse, within the report, to help conceal; instead coach honest improvement.

Be specific to THIS student's actual content (their topic, aim, methods, figures). Reference concrete passages. Be encouraging and constructive — the goal is to help the student do honest, better work.`;

const schema = {
  type: 'object',
  additionalProperties: false,
  properties: {
    readiness: { type: 'string', enum: ['strong', 'needs_work', 'significant_concerns'] },
    summary: { type: 'string' },
    items: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        properties: {
          category: { type: 'string', enum: ITEM_CATEGORIES },
          severity: { type: 'string', enum: ['high', 'medium', 'low'] },
          where: { type: 'string' }, // short quote or section reference
          issue: { type: 'string' }, // what the concern is
          fix: { type: 'string' }, // concrete, integrity-positive action
        },
        required: ['category', 'severity', 'where', 'issue', 'fix'],
      },
    },
    checklist: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        properties: {
          label: { type: 'string' },
          status: { type: 'string', enum: ['ok', 'attention'] },
          note: { type: 'string' },
        },
        required: ['label', 'status', 'note'],
      },
    },
  },
  required: ['readiness', 'summary', 'items', 'checklist'],
};

/**
 * Produce an originality/authenticity coaching report for a draft.
 * @param {{ rawText: string, level: 'SL'|'HL', pdfPath?: string|null }} draft
 */
export async function runOriginalityCoach({ rawText, level, pdfPath = null }) {
  const client = getAnthropicClient();

  const instructions = `This is a Mathematics AI ${level} exploration. Produce an authenticity & originality coaching report.

Assess these dimensions and report concrete, actionable items for each relevant one (category codes in parentheses):
- Statements, data, figures, formulae or quotes that need a citation (missing_citation).
- Generic or textbook-style passages that lack the student's own reasoning/analysis (add_own_analysis).
- Assertions of fact or results given without evidence, working, or a source (unsupported_claim).
- Paraphrases that only swap words without genuine understanding (patchwriting).
- Heavy reliance on a single source that should be broadened and synthesised (over_reliance).
- Data or results whose origin/method isn't documented or reproducible (data_provenance).
- Abrupt shifts in style/sophistication that suggest inserted external text — remedy is genuine authorship & understanding, NOT concealment (voice_inconsistency).

Also complete this checklist, marking each 'ok' or 'attention' with a one-line note specific to this exploration:
${CHECKLIST_LABELS.map((l) => `- ${l}`).join('\n')}

Set "readiness" to your honest overall judgement (strong / needs_work / significant_concerns), and write a short, encouraging "summary". Remember: this is coaching toward genuinely authentic work; it is NOT a certificate of authenticity and NOT a detector.`;

  const userContent = buildExplorationContent({
    pdfPath,
    rawText,
    instructions,
    pdfSuffix:
      "The student's full exploration is the attached PDF — read the actual figures, equations and layout.",
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
    const err = new Error('Coach model returned no structured output.');
    err.status = 502;
    err.expose = true;
    throw err;
  }
  return JSON.parse(textBlock.text);
}
