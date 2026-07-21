// Question Bank API. Mounted behind requireAuth + requireProfile in app.js.
//
//   GET  /api/question-bank/taxonomy?course=AA&level=SL
//        The §8 sub-topic tree for the picker. The client consumes this rather
//        than keeping its own copy — taxonomy.js is the single source of truth.
//        An SL request never returns AHL sub-topics (§2.3).
//
//   GET  /api/question-bank/weighting?course=AA&level=SL
//        §2.1 topic weights derived from teaching hours (never a flat 20%).
//
//   POST /api/question-bank/generate
//        Generate one validated question. The response separates the question
//        from its advisory warnings so a teacher can act on the manual-review
//        items (§10 command terms, incline of difficulty, originality) instead
//        of them being buried in the payload.
//
// v1 stores nothing: there is no repository and no migration behind this
// router (the "generation tool, not a saved library" decision).
//
// TESTING SEAM: createQuestionBankRouter({ client }) lets a test inject a stub
// Anthropic client, so the FULL pipeline (request validation -> generation ->
// server-side field injection -> §10 validation -> response shaping) can be
// exercised over real HTTP without a live API key. Only the network boundary is
// faked; none of the logic under test is stubbed out.

import { Router } from 'express';
import { subtopicsByTopic, COURSES, STUDENT_LEVELS } from '../services/questionBank/taxonomy.js';
import { topicWeights, totalHours } from '../services/questionBank/weighting.js';
import { papersFor, calculatorNote } from '../services/questionBank/paperTypes.js';
import { generateQuestion } from '../services/questionBank/generate.js';

/** Validate the course/level pair shared by the read endpoints. */
function readCourseLevel(req) {
  const course = String(req.query.course ?? '').toUpperCase();
  const level = String(req.query.level ?? '').toUpperCase();
  if (!COURSES.includes(course)) {
    const err = new Error(`course must be one of ${COURSES.join(' | ')}`);
    err.status = 400;
    err.expose = true;
    throw err;
  }
  if (!STUDENT_LEVELS.includes(level)) {
    const err = new Error(`level must be one of ${STUDENT_LEVELS.join(' | ')}`);
    err.status = 400;
    err.expose = true;
    throw err;
  }
  return { course, level };
}

/**
 * Build the router.
 * @param {{ client?: object }} [deps] inject an Anthropic client for tests;
 *        omitted in production so generate.js resolves the real one.
 */
export function createQuestionBankRouter(deps = {}) {
  const router = Router();

  router.get('/taxonomy', (req, res, next) => {
    try {
      const { course, level } = readCourseLevel(req);
      res.json({
        course,
        level,
        topics: subtopicsByTopic(course, level),
        papers: papersFor(course, level).map((p) => ({
          paper: p.paper,
          marks: p.marks,
          minutes: p.minutes,
          calculator: p.calculator,
          note: calculatorNote(course, level, p.paper),
        })),
      });
    } catch (err) {
      next(err);
    }
  });

  router.get('/weighting', (req, res, next) => {
    try {
      const { course, level } = readCourseLevel(req);
      res.json({
        course,
        level,
        totalHours: totalHours(course, level),
        topics: topicWeights(course, level),
      });
    } catch (err) {
      next(err);
    }
  });

  router.post('/generate', async (req, res, next) => {
    try {
      const { course, level, paper, subtopicCodes, difficultyPosition, targetMarks } = req.body ?? {};

      // generateQuestion performs full request validation and throws 400 with
      // an exposed message; no need to duplicate those checks here.
      const { question, warnings, attempts } = await generateQuestion(
        { course, level, paper, subtopicCodes, difficultyPosition, targetMarks },
        deps.client ? { client: deps.client } : {}
      );

      // Warnings are a SIBLING of the question, never merged into it: they are
      // advisory/manual-review items the teacher must be able to see and act on.
      res.status(201).json({
        question,
        warnings,
        meta: {
          attempts,
          warningCount: warnings.length,
          reviewRequired: warnings.length > 0,
        },
      });
    } catch (err) {
      next(err);
    }
  });

  return router;
}

/** Production router, wired to the real Anthropic client. */
export default createQuestionBankRouter();
