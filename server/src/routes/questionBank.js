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
//   POST /api/question-bank/generate   (Server-Sent Events)
//        Generate one validated question, streamed as SSE. Generation can take
//        minutes (a 20-mark Paper 3 ~280s), which no serverless/proxy request
//        timeout tolerates — SSE keeps the connection alive with periodic bytes.
//
//        The model's TOKENS ARE NEVER FORWARDED. Output is structured JSON
//        validated as a whole, and a failed attempt is discarded and retried,
//        so streaming raw chunks could emit content that never passed §10. The
//        stream instead carries lifecycle events plus ONE validated payload:
//          event: progress  data: {"phase":"generating","attempt":1}
//          event: progress  data: {"phase":"validating","attempt":1}
//          event: progress  data: {"phase":"retrying","attempt":2,"checks":[...]}
//          event: done       data: {"question":{...},"warnings":[...],"meta":{...}}
//          event: error      data: {"status":502,"message":"..."}
//        The `done` payload is byte-identical to the old 201 body. A malformed
//        request is answered as a plain 400 JSON BEFORE the stream opens.
//        On client disconnect the in-flight model call is aborted (no orphaned
//        work). A comment heartbeat (: ping) every 15s defeats idle timeouts.
//
//   POST /api/question-bank/generate-paper   (Server-Sent Events)
//        Same SSE contract as /generate, but assembles a full, flat (no
//        Section A/B) paper of multiple independently-generated,
//        independently-validated questions. Worksheet-first by default
//        (any target mark total); pass examSimulation:true for the real
//        per-paper total (80/110/55). See paperBuilder.js.
//
//   POST /api/question-bank/export
//        NOT streamed — pure formatting on already-validated content from
//        /generate or /generate-paper. Returns a PDF or Word file. See
//        export.js, including its flagged note on math-notation fidelity.
//
// v1 stores nothing: there is no repository and no migration behind this
// router (the "generation tool, not a saved library" decision). The SSE
// refactor persists nothing either — OWNERSHIP-SCOPING stays closed.
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
import { generateQuestion, assertValidRequest } from '../services/questionBank/generate.js';
import { buildPaper, assertValidPaperRequest } from '../services/questionBank/paperBuilder.js';
import { renderPaperPdf, renderPaperDocx } from '../services/questionBank/export.js';

/** Interval between SSE comment heartbeats, ms. Must beat any proxy idle timeout. */
const HEARTBEAT_MS = 15_000;

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
    // --- Pre-flight: a malformed request is a plain 400, NOT a stream. Do this
    // before any SSE header so the central error handler can answer normally.
    let request;
    try {
      request = assertValidRequest(req.body ?? {});
    } catch (err) {
      return next(err);
    }

    // --- Commit to SSE.
    res.writeHead(200, {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no', // defeat proxy response buffering (nginx et al.)
    });
    res.flushHeaders?.();
    res.write(': ok\n\n'); // first bytes now, so the client and proxies see an open stream

    const send = (event, data) => {
      if (res.writableEnded) return;
      res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
    };

    // Heartbeat: generation can be silent for minutes between progress events;
    // a periodic comment keeps intermediaries from closing an "idle" stream.
    const heartbeat = setInterval(() => {
      if (!res.writableEnded) res.write(': ping\n\n');
    }, HEARTBEAT_MS);
    if (heartbeat.unref) heartbeat.unref();

    // Abort the in-flight model call if the client goes away — no orphaned work.
    const controller = new AbortController();
    let clientGone = false;
    res.on('close', () => {
      clientGone = true;
      controller.abort();
    });

    try {
      const { question, warnings, attempts } = await generateQuestion(request, {
        ...(deps.client ? { client: deps.client } : {}),
        signal: controller.signal,
        onEvent: (e) => send('progress', e),
      });

      // Warnings are a SIBLING of the question, never merged into it: they are
      // advisory/manual-review items the teacher must be able to see and act on.
      send('done', {
        question,
        warnings,
        meta: { attempts, warningCount: warnings.length, reviewRequired: warnings.length > 0 },
      });
    } catch (err) {
      // Client already gone (its own disconnect caused the abort): nothing to
      // send, and it isn't a server error. Otherwise surface a mapped, safe
      // error event — never provider detail (generate.js has already sanitised).
      if (!clientGone && !err.aborted) {
        const status = err.status && err.status >= 400 && err.status < 600 ? err.status : 500;
        send('error', { status, message: status < 500 || err.expose ? err.message : 'internal server error' });
        if (status >= 500 && !err.expose) console.error('[question-bank] generate error', err);
      }
    } finally {
      clearInterval(heartbeat);
      if (!res.writableEnded) res.end();
    }
  });

  // POST /generate-paper — same SSE contract as /generate, but assembles a
  // full flat (no Section A/B) paper of multiple independently-validated
  // questions. See paperBuilder.js for the planning/allocation logic and the
  // FLAGGED comments on the two judgment calls made there.
  router.post('/generate-paper', async (req, res, next) => {
    let request;
    try {
      request = assertValidPaperRequest(req.body ?? {});
    } catch (err) {
      return next(err);
    }

    res.writeHead(200, {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no',
    });
    res.flushHeaders?.();
    res.write(': ok\n\n');

    const send = (event, data) => {
      if (res.writableEnded) return;
      res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
    };

    const heartbeat = setInterval(() => {
      if (!res.writableEnded) res.write(': ping\n\n');
    }, HEARTBEAT_MS);
    if (heartbeat.unref) heartbeat.unref();

    const controller = new AbortController();
    let clientGone = false;
    res.on('close', () => {
      clientGone = true;
      controller.abort();
    });

    try {
      const { paper, warnings, meta } = await buildPaper(request, {
        ...(deps.client ? { client: deps.client } : {}),
        signal: controller.signal,
        onEvent: (e) => send('progress', e),
      });
      send('done', { paper, warnings, meta: { ...meta, warningCount: warnings.length } });
    } catch (err) {
      if (!clientGone && !err.aborted) {
        const status = err.status && err.status >= 400 && err.status < 600 ? err.status : 500;
        send('error', { status, message: status < 500 || err.expose ? err.message : 'internal server error' });
        if (status >= 500 && !err.expose) console.error('[question-bank] generate-paper error', err);
      }
    } finally {
      clearInterval(heartbeat);
      if (!res.writableEnded) res.end();
    }
  });

  // POST /export — pure formatting on already-generated, already-validated
  // content (a paper from /generate-paper, or a single question from
  // /generate). No model call, so a normal request/response, not SSE.
  //   body: { format: 'pdf'|'docx', paper?: {...}, question?: {...}, options?: {...} }
  //   (see export.js's ExportOptions typedef for `options`)
  router.post('/export', async (req, res, next) => {
    try {
      const { format = 'pdf', paper, question, options = {} } = req.body ?? {};
      const input = paper ?? question;
      if (!input) {
        const err = new Error('Provide `paper` or `question` to export.');
        err.status = 400;
        err.expose = true;
        throw err;
      }
      if (format !== 'pdf' && format !== 'docx') {
        const err = new Error(`format must be 'pdf' or 'docx' (got ${JSON.stringify(format)}).`);
        err.status = 400;
        err.expose = true;
        throw err;
      }

      const buffer = format === 'pdf'
        ? await renderPaperPdf(input, options)
        : await renderPaperDocx(input, options);

      const contentType = format === 'pdf'
        ? 'application/pdf'
        : 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
      res.setHeader('Content-Type', contentType);
      res.setHeader('Content-Disposition', `attachment; filename="question-bank.${format}"`);
      res.send(buffer);
    } catch (err) {
      next(err);
    }
  });

  return router;
}

/** Production router, wired to the real Anthropic client. */
export default createQuestionBankRouter();
