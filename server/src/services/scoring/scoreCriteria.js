// Scores one or more IB criteria for a draft with a single Claude call, using
// structured outputs so the response is guaranteed-valid JSON matching our
// schema. Written generically (takes a list of criterion keys) so later build
// steps can reuse it for D, E and C.

import fs from 'node:fs';
import { getAnthropicClient, SCORING_MODEL } from '../anthropicClient.js';
import { readPdfBase64 } from '../pdf.js';
import { CRITERIA } from './criteria.js';

const SYSTEM_PROMPT = `You are an experienced IB Mathematics: Applications and Interpretation (AI) examiner, moderating a student's Internal Assessment ("the exploration").

Your job is to award a mark for each requested assessment criterion using IB's official "best-fit" method:
- Read every markband descriptor for the criterion.
- Choose the single markband that most fairly reflects the OVERALL balance of achievement in the exploration.
- Best-fit does NOT require every element of a descriptor to be met. Do not withhold a level just because one phrase is only partially satisfied; equally, do not award a level the work clearly has not reached.
- Marks are whole numbers only — never fractions or decimals.

Be a fair, calibrated examiner: neither generous nor harsh. Base every judgement strictly on evidence in the exploration text provided — do not assume work that is not shown. Your reasoning and suggestions MUST refer to the student's ACTUAL content (their specific topic, aim, methods, figures), not generic advice.

For each criterion return:
- "mark": the awarded whole-number mark within the criterion's range.
- "reasoning": 1–3 sentences, specific to this student's work, explaining what the exploration did that justifies this mark (what was done well at this level).
- "improvement": if the mark is below the maximum, ONE concrete, actionable change tied to what is missing for the NEXT markband up, referencing the student's actual content. If the mark is already the maximum, briefly note what sustains it.`;

function criterionBlock(key) {
  const c = CRITERIA[key];
  const bands = c.bands.map((b) => `  ${b.mark}: ${b.descriptor}`).join('\n');
  return `Criterion ${key} — ${c.name} (0–${c.maxMark})
Focus: ${c.focus}
Markbands:
${bands}
Guidance: ${c.guidance}`;
}

function buildSchema(keys) {
  const properties = {};
  for (const key of keys) {
    const c = CRITERIA[key];
    properties[key] = {
      type: 'object',
      additionalProperties: false,
      properties: {
        // enum constrains the mark to the valid whole-number range (structured
        // outputs don't support numeric min/max, but enum is supported).
        mark: { type: 'integer', enum: c.bands.map((b) => b.mark) },
        reasoning: { type: 'string' },
        improvement: { type: 'string' },
      },
      required: ['mark', 'reasoning', 'improvement'],
    };
  }
  return {
    type: 'object',
    additionalProperties: false,
    properties: { criteria: { type: 'object', additionalProperties: false, properties, required: keys } },
    required: ['criteria'],
  };
}

/**
 * Score the given criteria for a draft.
 *
 * When `pdfPath` points to a stored PDF, the ACTUAL PDF is sent to the model so
 * figures, graphs and equations are seen. Otherwise the extracted/pasted text
 * is used. `rawText` is always included as a fallback / transcript.
 *
 * @param {string[]} keys e.g. ['A','B']
 * @param {{ rawText: string, level: 'SL'|'HL', pdfPath?: string|null }} draft
 * @returns {Promise<Array<{criterion, engine_mark, max_mark, confidence_tier, reasoning_summary, improvement_suggestion}>>}
 */
export async function scoreCriteria(keys, { rawText, level, pdfPath = null }) {
  const client = getAnthropicClient();
  const schema = buildSchema(keys);

  const hasPdf = pdfPath && fs.existsSync(pdfPath);

  const instructions = `This is a Mathematics AI ${level} exploration.

Assess the following criteria using best-fit. ${
    keys.length > 1 ? 'Score each independently.' : ''
  }

${keys.map(criterionBlock).join('\n\n')}`;

  // For a PDF, place the document block first, then the instructions — and tell
  // the model the figures/equations in the PDF are part of the assessment.
  const userContent = hasPdf
    ? [
        {
          type: 'document',
          source: { type: 'base64', media_type: 'application/pdf', data: readPdfBase64(pdfPath) },
        },
        {
          type: 'text',
          text: `${instructions}

The student's full exploration is the attached PDF. Assess what you see in it directly — figures, graphs, tables and mathematical notation included.`,
        },
      ]
    : [
        {
          type: 'text',
          text: `${instructions}

=== STUDENT EXPLORATION TEXT (begins) ===
${rawText}
=== STUDENT EXPLORATION TEXT (ends) ===`,
        },
      ];

  const response = await client.messages.create({
    model: SCORING_MODEL,
    max_tokens: 16000,
    thinking: { type: 'adaptive' },
    output_config: {
      effort: 'high',
      format: { type: 'json_schema', schema },
    },
    system: SYSTEM_PROMPT,
    messages: [{ role: 'user', content: userContent }],
  });

  const textBlock = response.content.find((b) => b.type === 'text');
  if (!textBlock) {
    const err = new Error('Scoring model returned no structured output.');
    err.status = 502;
    err.expose = true;
    throw err;
  }
  const parsed = JSON.parse(textBlock.text);

  return keys.map((key) => {
    const c = CRITERIA[key];
    const r = parsed.criteria[key];
    // Clamp defensively even though enum should already bound the mark.
    const mark = Math.max(0, Math.min(c.maxMark, Math.round(r.mark)));
    return {
      criterion: key,
      engine_mark: mark,
      max_mark: c.maxMark,
      confidence_tier: c.confidenceTier,
      reasoning_summary: r.reasoning,
      improvement_suggestion: r.improvement,
    };
  });
}
