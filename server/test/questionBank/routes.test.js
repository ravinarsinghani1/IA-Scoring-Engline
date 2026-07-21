// Question Bank HTTP layer. Two things are checked here that unit tests cannot:
//   1. the router is genuinely mounted BEHIND requireAuth + requireProfile in
//      app.js (an unauthenticated caller must not reach it); and
//   2. the §2.3 guarantee survives all the way to the API boundary.

import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';

import app from '../../src/app.js';
import questionBankRouter, { createQuestionBankRouter } from '../../src/routes/questionBank.js';

/** The model-authored half of a valid AA SL P2 question (5 marks). */
const modelOutput = () => ({
  subtopicCodes: ['SL5.9'],
  totalMarks: 5,
  totalLine: 'Total: [5 marks]',
  parts: [
    {
      label: '(a)', commandTerm: 'Find', marks: 2,
      prompt: 'Find the velocity when t = 3, giving your answer to 3 s.f.',
      allocationLine: '[M1 for differentiating, A1 for answer — 2 marks]',
      markSchemeLines: [
        { annotation: 'M1', text: 'Differentiate s(t) to obtain v(t).' },
        { annotation: 'A1', text: 'v(3) = 12.4 (3 s.f.)' },
      ],
    },
    {
      label: '(b)', commandTerm: 'Determine', marks: 3,
      prompt: 'Determine the times at which the particle is at rest.',
      allocationLine: '[M1 for setting v = 0, A1A1 for both times — 3 marks]',
      markSchemeLines: [
        { annotation: 'M1', text: 'Set v(t) = 0.' },
        { annotation: 'A1A1', text: 't = 1 and t = 4' },
      ],
    },
  ],
});

/** Stub Anthropic client: returns each queued payload in turn. */
function stubClient(payloads) {
  const calls = [];
  return {
    calls,
    messages: {
      stream: (args) => {
        calls.push(args);
        return {
          finalMessage: async () => ({
            content: [{
              type: 'text',
              text: JSON.stringify(payloads[Math.min(calls.length - 1, payloads.length - 1)]),
            }],
          }),
        };
      },
    },
  };
}

/** Start an express app on an ephemeral port; returns { url, close }. */
async function serve(target) {
  const server = await new Promise((resolve) => {
    const s = target.listen(0, () => resolve(s));
  });
  const { port } = server.address();
  return {
    url: `http://127.0.0.1:${port}`,
    close: () => new Promise((r) => server.close(r)),
  };
}

// --- the real app: proves the router is auth-protected --------------------
describe('mounting — the Question Bank is behind auth', () => {
  let real;
  before(async () => { real = await serve(app); });
  after(async () => { await real.close(); });

  for (const path of ['/api/question-bank/taxonomy?course=AA&level=SL',
                      '/api/question-bank/weighting?course=AA&level=SL']) {
    it(`GET ${path.split('?')[0]} without a token is 401`, async () => {
      const res = await fetch(`${real.url}${path}`);
      assert.equal(res.status, 401);
    });
  }

  it('POST /api/question-bank/generate without a token is 401', async () => {
    const res = await fetch(`${real.url}/api/question-bank/generate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ course: 'AA', level: 'SL', paper: 'P2', subtopicCodes: ['SL5.9'] }),
    });
    assert.equal(res.status, 401);
    // Must not leak a generated question to an unauthenticated caller.
    const body = await res.json().catch(() => ({}));
    assert.equal('question' in body, false);
  });

  it('an unrelated data route is still protected (no regression)', async () => {
    assert.equal((await fetch(`${real.url}/api/explorations`)).status, 401);
  });

  it('health stays public', async () => {
    assert.equal((await fetch(`${real.url}/api/health`)).status, 200);
  });
});

// --- the router in isolation: its own behaviour ---------------------------
describe('router behaviour (auth bypassed)', () => {
  let bare;
  before(async () => {
    const a = express();
    a.use(express.json());
    a.use('/qb', questionBankRouter);
    // Mirror the app's error handler so status codes surface correctly.
    a.use((err, _req, res, _next) => {
      const status = err.status && err.status >= 400 && err.status < 600 ? err.status : 500;
      res.status(status).json({ error: status < 500 || err.expose ? err.message : 'internal server error' });
    });
    bare = await serve(a);
  });
  after(async () => { await bare.close(); });

  describe('GET /taxonomy', () => {
    it('returns all five topics for AA SL', async () => {
      const res = await fetch(`${bare.url}/qb/taxonomy?course=AA&level=SL`);
      assert.equal(res.status, 200);
      const body = await res.json();
      assert.equal(body.course, 'AA');
      assert.equal(body.topics.length, 5);
    });

    it('an SL request returns NO AHL sub-topics (§2.3 at the API boundary)', async () => {
      const res = await fetch(`${bare.url}/qb/taxonomy?course=AA&level=SL`);
      const body = await res.json();
      const codes = body.topics.flatMap((t) => t.subtopics.map((s) => s.code));
      assert.ok(codes.length > 0);
      assert.deepEqual(codes.filter((c) => c.startsWith('AHL')), []);
    });

    it('an HL request DOES include AHL sub-topics', async () => {
      const res = await fetch(`${bare.url}/qb/taxonomy?course=AA&level=HL`);
      const body = await res.json();
      const codes = body.topics.flatMap((t) => t.subtopics.map((s) => s.code));
      assert.ok(codes.some((c) => c.startsWith('AHL')));
    });

    it('SL offers two papers, HL offers three', async () => {
      const sl = await (await fetch(`${bare.url}/qb/taxonomy?course=AA&level=SL`)).json();
      const hl = await (await fetch(`${bare.url}/qb/taxonomy?course=AA&level=HL`)).json();
      assert.deepEqual(sl.papers.map((p) => p.paper), ['P1', 'P2']);
      assert.deepEqual(hl.papers.map((p) => p.paper), ['P1', 'P2', 'P3']);
    });

    it('carries the calculator policy per paper', async () => {
      const body = await (await fetch(`${bare.url}/qb/taxonomy?course=AA&level=SL`)).json();
      const p1 = body.papers.find((p) => p.paper === 'P1');
      assert.equal(p1.calculator, 'none');
      assert.match(p1.note, /^No calculator/);
    });

    it('is case-insensitive on query params', async () => {
      assert.equal((await fetch(`${bare.url}/qb/taxonomy?course=aa&level=sl`)).status, 200);
    });

    for (const q of ['', '?course=AA', '?level=SL', '?course=XX&level=SL', '?course=AA&level=XL']) {
      it(`rejects "${q || '(no params)'}" with 400`, async () => {
        assert.equal((await fetch(`${bare.url}/qb/taxonomy${q}`)).status, 400);
      });
    }
  });

  describe('GET /weighting', () => {
    it('returns hour-derived weights, not a flat 20%', async () => {
      const res = await fetch(`${bare.url}/qb/weighting?course=AI&level=SL`);
      assert.equal(res.status, 200);
      const body = await res.json();
      assert.equal(body.totalHours, 120);
      assert.equal(body.topics.length, 5);
      assert.equal(body.topics.every((t) => t.percent === 20), false);
      // AI SL Statistics is 30% — the value the flat split erased.
      assert.equal(body.topics.find((t) => t.topic === 4).percent, 30);
    });

    it('weights sum to 1', async () => {
      const body = await (await fetch(`${bare.url}/qb/weighting?course=AA&level=HL`)).json();
      const sum = body.topics.reduce((a, t) => a + t.weight, 0);
      assert.ok(Math.abs(sum - 1) < 1e-12);
    });

    it('rejects a bad course with 400', async () => {
      assert.equal((await fetch(`${bare.url}/qb/weighting?course=ZZ&level=SL`)).status, 400);
    });
  });

  describe('POST /generate — success path over real HTTP (stubbed model only)', () => {
    let e2e, client;
    before(async () => {
      client = stubClient([modelOutput()]);
      const a = express();
      a.use(express.json());
      a.use('/qb', createQuestionBankRouter({ client }));
      a.use((err, _req, res, _next) => {
        const status = err.status && err.status >= 400 && err.status < 600 ? err.status : 500;
        res.status(status).json({ error: status < 500 || err.expose ? err.message : 'internal server error' });
      });
      e2e = await serve(a);
    });
    after(async () => { await e2e.close(); });

    const post = () => fetch(`${e2e.url}/qb/generate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        course: 'AA', level: 'SL', paper: 'P2',
        subtopicCodes: ['SL5.9'], difficultyPosition: 'mid',
      }),
    });

    it('returns 201 with the { question, warnings, meta } shape', async () => {
      const res = await post();
      assert.equal(res.status, 201);
      const body = await res.json();
      assert.deepEqual(Object.keys(body).sort(), ['meta', 'question', 'warnings']);
      assert.ok(Array.isArray(body.warnings));
      assert.equal(typeof body.question, 'object');
    });

    it('the question survives the round trip with injected fields intact', async () => {
      const body = await (await post()).json();
      const q = body.question;
      assert.equal(q.course, 'AA');
      assert.equal(q.level, 'SL');
      assert.equal(q.paper, 'P2');
      assert.equal(q.calculatorAllowed, true);      // derived server-side
      assert.equal(q.difficultyPosition, 'mid');
      assert.equal(q.totalMarks, 5);
      assert.equal(q.parts.length, 2);
    });

    it('warnings reach the client and stay OUT of the question object', async () => {
      const body = await (await post()).json();
      assert.ok(body.warnings.some((w) => w.check === 'originality'),
        'teacher cannot see the originality review item');
      for (const key of ['warnings', 'errors', 'findings', 'ok']) {
        assert.equal(key in body.question, false, `question leaked "${key}"`);
      }
    });

    it('meta reports attempts and flags that review is required', async () => {
      const body = await (await post()).json();
      assert.equal(body.meta.attempts, 1);
      assert.equal(body.meta.warningCount, body.warnings.length);
      assert.equal(body.meta.reviewRequired, true);
    });

    it('the real pipeline ran — the model was actually called', async () => {
      const before = client.calls.length;
      await post();
      assert.equal(client.calls.length, before + 1);
    });
  });

  describe('POST /generate — failure path over real HTTP', () => {
    it('502 (not a partial question) when both attempts fail validation', async () => {
      const broken = { ...modelOutput(), totalMarks: 99 };   // parts sum to 5
      const a = express();
      a.use(express.json());
      a.use('/qb', createQuestionBankRouter({ client: stubClient([broken, broken]) }));
      a.use((err, _req, res, _next) => {
        const status = err.status && err.status >= 400 && err.status < 600 ? err.status : 500;
        res.status(status).json({ error: status < 500 || err.expose ? err.message : 'internal server error' });
      });
      const srv = await serve(a);
      try {
        const res = await fetch(`${srv.url}/qb/generate`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            course: 'AA', level: 'SL', paper: 'P2', subtopicCodes: ['SL5.9'],
          }),
        });
        assert.equal(res.status, 502);
        const body = await res.json();
        assert.equal('question' in body, false, 'served unvalidated content');
        assert.match(body.error, /after 2 attempts/);
      } finally {
        await srv.close();
      }
    });
  });

  describe('POST /generate — request validation', () => {
    // These all fail before any model call, so no API key is needed.
    const bad = [
      ['missing body fields', {}],
      ['invalid course', { course: 'XX', level: 'SL', paper: 'P2', subtopicCodes: ['SL5.9'] }],
      ['P3 at SL', { course: 'AA', level: 'SL', paper: 'P3', subtopicCodes: ['SL5.9'] }],
      ['no sub-topics', { course: 'AA', level: 'SL', paper: 'P2', subtopicCodes: [] }],
      ['AHL sub-topic at SL', { course: 'AA', level: 'SL', paper: 'P2', subtopicCodes: ['AHL5.13'] }],
      ['bad difficultyPosition', { course: 'AA', level: 'SL', paper: 'P2', subtopicCodes: ['SL5.9'], difficultyPosition: 'hard' }],
    ];

    for (const [label, body] of bad) {
      it(`${label} -> 400`, async () => {
        const res = await fetch(`${bare.url}/qb/generate`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        });
        assert.equal(res.status, 400);
        const json = await res.json();
        assert.equal('question' in json, false, 'returned content despite a bad request');
      });
    }
  });
});
