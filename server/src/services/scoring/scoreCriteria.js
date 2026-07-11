// Scores one or more IB criteria for a draft with a single Claude call, using
// structured outputs so the response is guaranteed-valid JSON matching our
// schema. Written generically (takes a list of criterion keys) so later build
// steps can reuse it for D, E and C.

import { getAnthropicClient, SCORING_MODEL } from '../anthropicClient.js';
import { buildExplorationContent, courseLabel } from '../promptContent.js';
import { CRITERIA } from './criteria.js';

const SYSTEM_PROMPT = `You are an experienced IB Mathematics examiner (both Applications & Interpretation and Analysis & Approaches), moderating a student's Internal Assessment ("the exploration"). The assessment criteria are identical for both courses.

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

// Criterion E's descriptors differ by level; everything else is level-agnostic.
function bandsFor(c, level) {
  return c.bandsByLevel ? c.bandsByLevel[level] || c.bandsByLevel.SL : c.bands;
}

function criterionBlock(key, level) {
  const c = CRITERIA[key];
  const bands = bandsFor(c, level)
    .map((b) => `  ${b.mark}: ${b.descriptor}`)
    .join('\n');
  return `Criterion ${key} — ${c.name} (0–${c.maxMark})${
    c.levelDependent ? ` [descriptors specific to ${level}]` : ''
  }
Focus: ${c.focus}
Markbands:
${bands}
Guidance: ${c.guidance}`;
}

function buildSchema(keys, level) {
  const properties = {};
  for (const key of keys) {
    const c = CRITERIA[key];
    const marks = bandsFor(c, level).map((b) => b.mark);
    let props;
    let required;

    if (c.confidenceTier === 'low') {
      // Low-confidence criteria (C) are presented as a suggested RANGE, never a
      // single definitive mark. enum keeps both ends within the valid range.
      props = {
        range_low: { type: 'integer', enum: marks },
        range_high: { type: 'integer', enum: marks },
        reasoning: { type: 'string' },
        improvement: { type: 'string' },
      };
      required = ['range_low', 'range_high', 'reasoning', 'improvement'];
    } else {
      props = {
        // enum constrains the mark to the valid whole-number range (structured
        // outputs don't support numeric min/max, but enum is supported).
        mark: { type: 'integer', enum: marks },
        reasoning: { type: 'string' },
        improvement: { type: 'string' },
      };
      required = ['mark', 'reasoning', 'improvement'];

      // Medium-confidence criteria (D, E) carry a visible boundary flag so the
      // teacher knows when the mark sits right on a markband boundary.
      if (c.confidenceTier === 'medium') {
        props.review_recommended = { type: 'boolean' };
        props.boundary_note = { type: 'string' };
        required.push('review_recommended', 'boundary_note');
      }
    }

    properties[key] = {
      type: 'object',
      additionalProperties: false,
      properties: props,
      required,
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
export async function scoreCriteria(keys, { rawText, level, subject = 'AI', pdfPath = null }) {
  const client = getAnthropicClient();
  const schema = buildSchema(keys, level);

  const hasMedium = keys.some((k) => CRITERIA[k].confidenceTier === 'medium');
  const hasLow = keys.some((k) => CRITERIA[k].confidenceTier === 'low');
  const hasE = keys.includes('E');

  const instructions = `This is a ${courseLabel(subject, level)} exploration.

Assess the following criteria using best-fit. ${
    keys.length > 1 ? 'Score each independently.' : ''
  }

${keys.map((k) => criterionBlock(k, level)).join('\n\n')}${
    hasE
      ? `\n\nFor Criterion E specifically, actively VERIFY the mathematics — do not judge it by appearance. Work through the derivations and calculations, confirm that stated numerical and statistical results (e.g. regression coefficients, R², solved values) genuinely follow from the data and methods shown, and identify any errors or steps that do not follow. The correctness of the mathematics is decisive for the E mark.`
      : ''
  }${
    hasMedium
      ? `\n\nFor any criterion whose output includes "review_recommended": set it to true ONLY when the exploration sits genuinely on the boundary between two markbands for that criterion (a defensible case could be made for either level); otherwise false. When true, use "boundary_note" to name the two levels and briefly say why it is borderline; when false, set "boundary_note" to an empty string.`
      : ''
  }${
    hasLow
      ? `\n\nFor any criterion whose output asks for "range_low" and "range_high": this judgement (personal engagement) is holistic and hard to evidence from text alone, so give a SUGGESTED RANGE of plausible marks rather than a single definitive one (range_low ≤ range_high, both within the criterion's range). Base it on GENUINE engagement — independent/creative thinking, the student's own perspective and questions, testing ideas, exploring from different angles — NOT on effort, length or neatness. The teacher makes the final decision.`
      : ''
  }`;

  const userContent = await buildExplorationContent({
    pdfPath,
    rawText,
    instructions,
    pdfSuffix:
      "The student's full exploration is the attached PDF. Assess what you see in it directly — figures, graphs, tables and mathematical notation included.",
  });

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
    const cap = (n) => Math.max(0, Math.min(c.maxMark, Math.round(n)));

    if (c.confidenceTier === 'low') {
      // Presented as a range; no single definitive mark. Always mandatory review.
      let lo = cap(r.range_low);
      let hi = cap(r.range_high);
      if (lo > hi) [lo, hi] = [hi, lo];
      return {
        criterion: key,
        engine_mark: null,
        range_low: lo,
        range_high: hi,
        max_mark: c.maxMark,
        confidence_tier: 'low',
        reasoning_summary: r.reasoning,
        improvement_suggestion: r.improvement,
        review_recommended: true, // mandatory teacher review, always
        boundary_note: null,
      };
    }

    return {
      criterion: key,
      engine_mark: cap(r.mark),
      range_low: null,
      range_high: null,
      max_mark: c.maxMark,
      confidence_tier: c.confidenceTier,
      reasoning_summary: r.reasoning,
      improvement_suggestion: r.improvement,
      review_recommended: r.review_recommended ?? false,
      boundary_note: r.boundary_note || null,
    };
  });
}
