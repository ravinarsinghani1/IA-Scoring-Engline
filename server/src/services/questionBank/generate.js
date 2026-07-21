// Tests: server/test/questionBank/generate.test.js  (run: npm test, from server/)
//
// Question generation. Mirrors services/scoring/scoreCriteria.js: one Claude
// call with structured outputs so the response is schema-valid JSON.
//
// ---------------------------------------------------------------------------
// DESIGN: THE MODEL IS ONLY ASKED FOR WHAT IT ALONE CAN DECIDE.
//
// Fields that are derived (§5.7 calculatorAllowed) or chosen by the caller
// (course, level, paper, difficultyPosition) are INJECTED server-side after
// generation rather than requested from the model. A model cannot get wrong a
// field it was never asked for. The model supplies only genuine content:
// which sub-topics it used, the marks, the parts and the mark schemes.
//
// Two independent defences carry the §2.3 guarantee:
//   1. the JSON schema's subtopicCodes enum lists ONLY codes legal for this
//      course+level, so an SL request cannot even express an AHL code; and
//   2. validateQuestion() re-checks it afterwards.
// Belt and braces, because a schema constraint that is quietly unsupported by
// the API would otherwise fail silently.
// ---------------------------------------------------------------------------

import { getAnthropicClient, SCORING_MODEL } from '../anthropicClient.js';
import { subtopicsFor, findSubtopic, topicName } from './taxonomy.js';
import { findPaperType, allowsCalculator, calculatorNote } from './paperTypes.js';
import { markSchemePromptGuidance } from './markScheme.js';
import { commandTermPromptGuidance } from './commandTerms.js';
import { validateQuestion, DIFFICULTY_POSITIONS } from './validate.js';

/** Override with QUESTION_BANK_MODEL; defaults to the scoring model. */
export const QUESTION_BANK_MODEL = process.env.QUESTION_BANK_MODEL || SCORING_MODEL;

/**
 * Total generation attempts. Per the generation-engine spec: if validation
 * fails, retry ONCE with a corrective message; if it fails twice, return an
 * error rather than serving unvalidated content.
 */
export const MAX_GENERATION_ATTEMPTS = 2;

const SYSTEM_PROMPT = `You are an experienced IB Diploma Programme Mathematics examiner writing practice questions for teachers.

You write ORIGINAL questions that follow IB examination conventions. This is the single most important constraint:

- NEVER reproduce, paraphrase, or lightly reskin any question from a real IB paper, specimen paper, textbook, or question bank. Every question must be composed fresh.
- Do not reuse distinctive scenarios, names, or numeric values you associate with a published question. Choose your own context and your own numbers.
- Matching IB *conventions* (command terms, mark allocation, mark-scheme mechanics, incline of difficulty) is required. Reproducing IB *content* is not permitted.

Write questions that are mathematically correct and fully solvable with the information given. Verify your own arithmetic: every value in the mark scheme must genuinely follow from the question as posed.`;

/**
 * JSON schema for the model's output. Only the fields the model is responsible
 * for; the rest are injected afterwards by generateQuestion().
 */
export function buildQuestionSchema(allowedCodes) {
  const markSchemeLine = {
    type: 'object',
    additionalProperties: false,
    properties: {
      annotation: { type: 'string' },
      text: { type: 'string' },
    },
    required: ['annotation', 'text'],
  };

  const part = {
    type: 'object',
    additionalProperties: false,
    properties: {
      label: { type: 'string' },
      commandTerm: { type: 'string' },
      marks: { type: 'integer' },
      prompt: { type: 'string' },
      allocationLine: { type: 'string' },
      markSchemeLines: { type: 'array', items: markSchemeLine },
      alternativeMethods: {
        type: 'array',
        items: {
          type: 'object',
          additionalProperties: false,
          properties: {
            label: { type: 'string' },
            lines: { type: 'array', items: markSchemeLine },
          },
          required: ['label', 'lines'],
        },
      },
    },
    required: ['label', 'commandTerm', 'marks', 'prompt', 'allocationLine'],
  };

  return {
    type: 'object',
    additionalProperties: false,
    properties: {
      // Enum is the schema-level half of the §2.3 guarantee: an SL request
      // simply cannot express an AHL code.
      subtopicCodes: { type: 'array', items: { type: 'string', enum: allowedCodes } },
      totalMarks: { type: 'integer' },
      totalLine: { type: 'string' },
      parts: { type: 'array', items: part },
    },
    required: ['subtopicCodes', 'totalMarks', 'totalLine', 'parts'],
  };
}

/** Human-readable list of the sub-topics the question may draw on. */
function subtopicBlock(course, codes) {
  return codes
    .map((code) => {
      const e = findSubtopic(course, code);
      return `  ${code} (${topicName(e.topic)}) — ${e.description}`;
    })
    .join('\n');
}

/** Compose the user instructions for one generation request. */
export function buildInstructions({
  course, level, paper, subtopicCodes, difficultyPosition, targetMarks,
}) {
  const paperType = findPaperType(course, level, paper);
  const inclineNote = {
    early: 'This question sits EARLY on the paper\'s incline of difficulty: straightforward, accessible entry.',
    mid: 'This question sits MID-incline: moderate demand throughout.',
    late: 'This question sits LATE on the incline: demanding, building to a challenging final part.',
  }[difficultyPosition];

  return `Write ONE original ${course} ${level} ${paper} practice question.

Sub-topics it may draw on (use one or more; tag every one you actually use):
${subtopicBlock(course, subtopicCodes)}

${calculatorNote(course, level, paper)}
${allowsCalculator(course, level, paper)
    ? 'A graphic display calculator is assumed. GDC methods are expected and should be stated explicitly in the mark scheme.'
    : 'NO calculator is available. The question must be fully solvable by hand, and the mark scheme must not rely on any calculator method.'}

${inclineNote}
${targetMarks ? `Aim for approximately ${targetMarks} marks in total.` : `Choose a mark total appropriate to a single ${paper} question (the whole paper is ${paperType.marks} marks).`}

Structure every question as labelled parts — (a), (b), (c)… — with sub-parts (i)/(ii) where useful.

${commandTermPromptGuidance()}

${markSchemePromptGuidance()}

Where a genuinely different valid approach exists, give it as alternative methods, labelled either METHOD 1 / METHOD 2 / … or EITHER / OR (never a mixture). Each labelled route must independently earn the part's full marks. Where only one sensible route exists, use a single mark scheme instead.

State the expected numeric accuracy (exact form, or a number of significant figures / decimal places) wherever a numeric answer is required.`;
}

/** Build the corrective message for the single retry. */
export function buildCorrection(errors) {
  const list = errors.map((e) => `  - [${e.check}] ${e.message}`).join('\n');
  return `Your previous attempt FAILED validation against the IB question-bank rules. Fix every problem below and produce a corrected question.

${list}

Re-read the constraints and produce a question that satisfies all of them. Do not repeat the same mistakes.`;
}

/** Extract and parse the model's structured JSON output. */
function parseModelOutput(response) {
  const textBlock = response?.content?.find((b) => b.type === 'text');
  if (!textBlock) {
    const err = new Error('Question generator returned no structured output.');
    err.status = 502;
    err.expose = true;
    throw err;
  }
  try {
    return JSON.parse(textBlock.text);
  } catch {
    const err = new Error('Question generator returned malformed JSON.');
    err.status = 502;
    err.expose = true;
    throw err;
  }
}

function badRequest(message) {
  const err = new Error(message);
  err.status = 400;
  err.expose = true;
  return err;
}

/**
 * Generate one validated question.
 *
 * @param {object} request
 * @param {'AA'|'AI'} request.course
 * @param {'SL'|'HL'} request.level
 * @param {'P1'|'P2'|'P3'} request.paper
 * @param {string[]} request.subtopicCodes   codes the teacher selected
 * @param {'early'|'mid'|'late'} [request.difficultyPosition='mid']
 * @param {number} [request.targetMarks]
 * @param {object} [deps]
 * @param {object} [deps.client]  injectable Anthropic client (for tests)
 * @returns {Promise<{ question: object, warnings: object[], attempts: number }>}
 *          Warnings are returned SEPARATELY from the question so a teacher can
 *          act on the advisory §10 items; they are never merged into content.
 * @throws  502 when validation fails on every attempt — an invalid question is
 *          never returned.
 */
export async function generateQuestion(request, deps = {}) {
  const {
    course, level, paper, subtopicCodes = [],
    difficultyPosition = 'mid', targetMarks = null,
  } = request ?? {};

  // --- request validation: fail fast, before spending a model call ---
  if (course !== 'AA' && course !== 'AI') throw badRequest(`course must be 'AA' or 'AI'.`);
  if (level !== 'SL' && level !== 'HL') throw badRequest(`level must be 'SL' or 'HL'.`);
  if (!findPaperType(course, level, paper)) {
    throw badRequest(`${paper} is not an examinable paper for ${course} ${level}.`);
  }
  if (!DIFFICULTY_POSITIONS.includes(difficultyPosition)) {
    throw badRequest(`difficultyPosition must be one of ${DIFFICULTY_POSITIONS.join(' | ')}.`);
  }
  if (!Array.isArray(subtopicCodes) || subtopicCodes.length === 0) {
    throw badRequest('Select at least one sub-topic.');
  }

  // Every requested code must be legal for this course AND level. This rejects
  // an AHL request at SL before any generation happens.
  const legal = subtopicsFor(course, level).map((e) => e.code);
  const legalSet = new Set(legal);
  const illegal = subtopicCodes.filter((c) => !legalSet.has(c));
  if (illegal.length > 0) {
    throw badRequest(
      `These sub-topics are not available for ${course} ${level}: ${illegal.join(', ')}.`
    );
  }

  const client = deps.client ?? getAnthropicClient();
  const schema = buildQuestionSchema(subtopicCodes);
  const instructions = buildInstructions({
    course, level, paper, subtopicCodes, difficultyPosition, targetMarks,
  });

  const messages = [{ role: 'user', content: instructions }];
  let lastErrors = [];

  for (let attempt = 1; attempt <= MAX_GENERATION_ATTEMPTS; attempt++) {
    const response = await client.messages.create({
      model: QUESTION_BANK_MODEL,
      max_tokens: 8000,
      thinking: { type: 'adaptive' },
      output_config: { effort: 'high', format: { type: 'json_schema', schema } },
      system: SYSTEM_PROMPT,
      messages,
    });

    const generated = parseModelOutput(response);

    // Inject the fields the model was never asked for. Authoritative.
    const question = {
      ...generated,
      course,
      level,
      paper,
      calculatorAllowed: allowsCalculator(course, level, paper),
      difficultyPosition,
    };

    const result = validateQuestion(question);
    if (result.ok) {
      return { question, warnings: result.warnings, attempts: attempt };
    }

    lastErrors = result.errors;
    if (attempt < MAX_GENERATION_ATTEMPTS) {
      messages.push({ role: 'assistant', content: JSON.stringify(generated) });
      messages.push({ role: 'user', content: buildCorrection(result.errors) });
    }
  }

  // Both attempts failed: return an error rather than unvalidated content.
  const err = new Error(
    `Could not generate a question meeting the IB rules after ${MAX_GENERATION_ATTEMPTS} attempts. ` +
    `Last problems: ${lastErrors.map((e) => e.message).join(' | ')}`
  );
  err.status = 502;
  err.expose = true;
  err.validationErrors = lastErrors;
  throw err;
}
