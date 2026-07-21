// Question generation — retry contract, server-side field injection, and the
// schema-level half of the §2.3 guarantee. No network: the Anthropic client is
// injected as a stub.

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
  generateQuestion, buildQuestionSchema, buildInstructions, buildCorrection,
  MAX_GENERATION_ATTEMPTS, QUESTION_BANK_MODEL, MAX_OUTPUT_TOKENS,
} from '../../src/services/questionBank/generate.js';

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

/** A stub client that returns each queued payload in turn, recording calls. */
function stubClient(payloads) {
  const calls = [];
  return {
    calls,
    messages: {
      stream: (args) => {
        calls.push(args);
        const payload = payloads[Math.min(calls.length - 1, payloads.length - 1)];
        return {
          finalMessage: async () => ({
            content: [{ type: 'text', text: JSON.stringify(payload) }],
          }),
        };
      },
    },
  };
}

const baseRequest = () => ({
  course: 'AA', level: 'SL', paper: 'P2',
  subtopicCodes: ['SL5.9'],
  difficultyPosition: 'mid',
});

describe('generate — request validation happens before any model call', () => {
  const cases = [
    ['invalid course', { course: 'XX' }],
    ['invalid level', { level: 'XL' }],
    ['non-examinable paper (P3 at SL)', { paper: 'P3' }],
    ['invalid difficultyPosition', { difficultyPosition: 'hard' }],
    ['no sub-topics', { subtopicCodes: [] }],
  ];

  for (const [label, patch] of cases) {
    it(`${label} throws 400 without calling the model`, async () => {
      const client = stubClient([modelOutput()]);
      await assert.rejects(
        () => generateQuestion({ ...baseRequest(), ...patch }, { client }),
        (e) => e.status === 400
      );
      assert.equal(client.calls.length, 0, 'model was called despite a bad request');
    });
  }

  it('an AHL sub-topic requested at SL is rejected before generation (§2.3)', async () => {
    const client = stubClient([modelOutput()]);
    await assert.rejects(
      () => generateQuestion({ ...baseRequest(), subtopicCodes: ['AHL5.13'] }, { client }),
      (e) => e.status === 400 && /not available for AA SL/.test(e.message)
    );
    assert.equal(client.calls.length, 0);
  });

  it('a code from the other course is rejected', async () => {
    const client = stubClient([modelOutput()]);
    await assert.rejects(
      () => generateQuestion({ ...baseRequest(), course: 'AI', subtopicCodes: ['SL5.9'] }, { client }),
      (e) => e.status === 400
    );
    assert.equal(client.calls.length, 0);
  });
});

describe('generate — happy path', () => {
  it('returns the question, its warnings, and the attempt count', async () => {
    const client = stubClient([modelOutput()]);
    const result = await generateQuestion(baseRequest(), { client });

    assert.equal(client.calls.length, 1);
    assert.equal(result.attempts, 1);
    assert.equal(result.question.totalMarks, 5);
    assert.ok(Array.isArray(result.warnings));
  });

  it('warnings are returned SEPARATELY, never merged into the question', async () => {
    const client = stubClient([modelOutput()]);
    const { question, warnings } = await generateQuestion(baseRequest(), { client });

    assert.ok(warnings.some((w) => w.check === 'originality'), 'originality warning missing');
    // The question object must carry no warning/finding keys of its own.
    for (const key of ['warnings', 'errors', 'findings', 'ok']) {
      assert.equal(key in question, false, `question leaked "${key}"`);
    }
  });
});

describe('generate — server-side field injection (the model is never asked)', () => {
  it('injects course, level, paper, calculatorAllowed and difficultyPosition', async () => {
    const client = stubClient([modelOutput()]);
    const { question } = await generateQuestion(baseRequest(), { client });

    assert.equal(question.course, 'AA');
    assert.equal(question.level, 'SL');
    assert.equal(question.paper, 'P2');
    assert.equal(question.calculatorAllowed, true);   // AA SL P2 permits a GDC
    assert.equal(question.difficultyPosition, 'mid');
  });

  it('derives calculatorAllowed=false for AA P1 regardless of model output', async () => {
    // The model tries to assert the wrong value; injection must win.
    const rogue = { ...modelOutput(), calculatorAllowed: true, course: 'AI', paper: 'P3' };
    const client = stubClient([rogue]);
    const { question } = await generateQuestion({ ...baseRequest(), paper: 'P1' }, { client });

    assert.equal(question.calculatorAllowed, false);
    assert.equal(question.course, 'AA');   // not the model's 'AI'
    assert.equal(question.paper, 'P1');    // not the model's 'P3'
  });
});

describe('generate — retry contract (2 attempts total)', () => {
  it('MAX_GENERATION_ATTEMPTS is 2', () => {
    assert.equal(MAX_GENERATION_ATTEMPTS, 2);
  });

  it('retries once when the first attempt fails validation, then succeeds', async () => {
    const broken = { ...modelOutput(), totalMarks: 99 };  // parts sum to 5, not 99
    const client = stubClient([broken, modelOutput()]);

    const result = await generateQuestion(baseRequest(), { client });

    assert.equal(client.calls.length, 2, 'expected exactly one retry');
    assert.equal(result.attempts, 2);
    assert.equal(result.question.totalMarks, 5);
  });

  it('the retry carries a corrective message naming the actual failures', async () => {
    const broken = { ...modelOutput(), totalMarks: 99 };
    const client = stubClient([broken, modelOutput()]);
    await generateQuestion(baseRequest(), { client });

    const retryMessages = client.calls[1].messages;
    const correction = retryMessages[retryMessages.length - 1].content;
    assert.match(correction, /FAILED validation/);
    assert.match(correction, /mark-format/);          // the actual check code
    assert.match(correction, /totalMarks is 99/);     // the actual failure detail
  });

  it('logs WHICH checks failed when a retry fires (otherwise the retry is invisible)', async () => {
    const broken = { ...modelOutput(), totalMarks: 99 };
    const client = stubClient([broken, modelOutput()]);

    const original = console.warn;
    const logged = [];
    console.warn = (...args) => logged.push(args);
    try {
      await generateQuestion(baseRequest(), { client });
    } finally {
      console.warn = original;
    }

    assert.equal(logged.length, 1, 'expected exactly one retry log');
    const [label, detail] = logged[0];
    assert.match(label, /validation failed, retrying/);
    assert.equal(detail.attempt, 1);
    assert.ok(detail.checks.includes('mark-format'), `checks were ${detail.checks}`);
    assert.equal(detail.course, 'AA');
    assert.equal(detail.paper, 'P2');
    assert.ok(detail.messages.some((m) => /totalMarks is 99/.test(m)));
  });

  it('does NOT log when the first attempt passes', async () => {
    const client = stubClient([modelOutput()]);
    const original = console.warn;
    const logged = [];
    console.warn = (...args) => logged.push(args);
    try {
      await generateQuestion(baseRequest(), { client });
    } finally {
      console.warn = original;
    }
    assert.equal(logged.length, 0);
  });

  it('throws 502 when BOTH attempts fail — never returns unvalidated content', async () => {
    const broken = { ...modelOutput(), totalMarks: 99 };
    const client = stubClient([broken, broken]);

    await assert.rejects(
      () => generateQuestion(baseRequest(), { client }),
      (e) => e.status === 502 && Array.isArray(e.validationErrors) && e.validationErrors.length > 0
    );
    assert.equal(client.calls.length, MAX_GENERATION_ATTEMPTS, 'attempted more than the budget');
  });

  it('never exceeds the attempt budget', async () => {
    const broken = { ...modelOutput(), totalMarks: 99 };
    const client = stubClient([broken]);
    await assert.rejects(() => generateQuestion(baseRequest(), { client }));
    assert.equal(client.calls.length, 2);
  });

  it('an AHL code smuggled past the schema is still caught by validation', async () => {
    // Simulates the schema enum being ignored: the validator is the second defence.
    const smuggled = { ...modelOutput(), subtopicCodes: ['AHL5.13'] };
    const client = stubClient([smuggled, smuggled]);
    await assert.rejects(
      () => generateQuestion(baseRequest(), { client }),
      (e) => e.status === 502 && e.validationErrors.some((v) => v.check === 'ahl-in-sl')
    );
  });
});

describe('generate — the model call is wired correctly', () => {
  it('uses QUESTION_BANK_MODEL (defaulting to the scoring model)', async () => {
    const client = stubClient([modelOutput()]);
    await generateQuestion(baseRequest(), { client });
    assert.equal(client.calls[0].model, QUESTION_BANK_MODEL);
    assert.ok(QUESTION_BANK_MODEL, 'model name must not be empty');
  });

  it('requests structured output against the built schema', async () => {
    const client = stubClient([modelOutput()]);
    await generateQuestion(baseRequest(), { client });
    const cfg = client.calls[0].output_config;
    assert.equal(cfg.format.type, 'json_schema');
    assert.deepEqual(cfg.format.schema.properties.subtopicCodes.items.enum, ['SL5.9']);
  });

  it('the system prompt carries the originality / no-verbatim-IB safeguard', async () => {
    const client = stubClient([modelOutput()]);
    await generateQuestion(baseRequest(), { client });
    const system = client.calls[0].system;
    assert.match(system, /NEVER reproduce/i);
    assert.match(system, /real IB paper/i);
    assert.match(system, /conventions/i);   // conventions permitted, content not
  });
});

describe('generate — upstream API failures are not the caller\'s fault', () => {
  /** A client whose model call rejects with an SDK-shaped error. */
  const failingClient = (status, message) => {
    const calls = [];
    return {
      calls,
      messages: {
        stream: () => {
          calls.push(1);
          return {
            finalMessage: async () => {
              const e = new Error(message);
              e.status = status;
              e.request_id = 'req_test';
              throw e;
            },
          };
        },
      },
    };
  };

  it('a billing rejection (upstream 400) becomes 502, NOT a 400 blaming the caller', async () => {
    const client = failingClient(400, 'Your credit balance is too low to access the Anthropic API. Please go to Plans & Billing to upgrade or purchase credits.');
    await assert.rejects(
      () => generateQuestion(baseRequest(), { client }),
      (e) => e.status === 502
    );
  });

  it('vendor billing detail never reaches the client message', async () => {
    const client = failingClient(400, 'Your credit balance is too low. Please go to Plans & Billing to upgrade or purchase credits.');
    await generateQuestion(baseRequest(), { client }).then(
      () => assert.fail('should have thrown'),
      (e) => {
        assert.doesNotMatch(e.message, /Plans & Billing/i);
        assert.doesNotMatch(e.message, /credit balance/i);
        assert.doesNotMatch(e.message, /Anthropic/i);
        assert.match(e.message, /unavailable/i);
      }
    );
  });

  it('auth failure (401) also becomes 502 with a safe message', async () => {
    const client = failingClient(401, 'invalid x-api-key');
    await assert.rejects(
      () => generateQuestion(baseRequest(), { client }),
      (e) => e.status === 502 && !/x-api-key/i.test(e.message)
    );
  });

  for (const [status, label] of [[429, 'rate limit'], [529, 'overloaded'], [500, 'server error']]) {
    it(`transient upstream ${status} (${label}) becomes 503 with retry-later wording`, async () => {
      const client = failingClient(status, 'upstream boom');
      await assert.rejects(
        () => generateQuestion(baseRequest(), { client }),
        (e) => e.status === 503 && /try again shortly/i.test(e.message)
      );
    });
  }

  it('an upstream failure does NOT consume the validation retry budget', async () => {
    const client = failingClient(429, 'rate limited');
    await assert.rejects(() => generateQuestion(baseRequest(), { client }));
    assert.equal(client.calls.length, 1, 'retried a request that failed upstream');
  });

  it('the original cause is retained for server-side logs', async () => {
    const client = failingClient(400, 'billing detail');
    await generateQuestion(baseRequest(), { client }).then(
      () => assert.fail('should have thrown'),
      (e) => {
        assert.equal(e.cause?.status, 400);
        assert.match(e.cause?.message, /billing detail/);
      }
    );
  });
});

describe('generate — output-budget truncation (found by live smoke test)', () => {
  // A real 15-mark Section B request returned ONLY a thinking block with
  // stop_reason=max_tokens: the thinking budget consumed the whole allowance
  // before any answer was written. That is a budget failure, not a format one.
  const truncatedClient = () => {
    const calls = [];
    return {
      calls,
      messages: {
        stream: () => {
          calls.push(1);
          return {
            finalMessage: async () => ({
              stop_reason: 'max_tokens',
              usage: { output_tokens: 64000, output_tokens_details: { thinking_tokens: 64000 } },
              content: [{ type: 'thinking', thinking: '' }],
            }),
          };
        },
      },
    };
  };

  it('MAX_OUTPUT_TOKENS is 64000 (streaming budget; 16000 truncated a live P3)', () => {
    assert.equal(MAX_OUTPUT_TOKENS, 64000);
  });

  it('the call actually requests that budget', async () => {
    const client = stubClient([modelOutput()]);
    await generateQuestion(baseRequest(), { client });
    assert.equal(client.calls[0].max_tokens, MAX_OUTPUT_TOKENS);
  });

  it('truncation is reported as a budget failure, not "no structured output"', async () => {
    await assert.rejects(
      () => generateQuestion(baseRequest(), { client: truncatedClient() }),
      (e) => e.status === 502
        && e.stopReason === 'max_tokens'
        && /ran out of output space/i.test(e.message)
        && !/structured output/i.test(e.message)
    );
  });

  it('the message is actionable for a teacher', async () => {
    await generateQuestion(baseRequest(), { client: truncatedClient() }).then(
      () => assert.fail('should have thrown'),
      (e) => assert.match(e.message, /smaller mark target/i)
    );
  });

  it('a thinking-only response without max_tokens still reports no output', async () => {
    const client = { messages: { stream: () => ({ finalMessage: async () => ({ stop_reason: 'end_turn', content: [{ type: 'thinking', thinking: '' }] }) }) } };
    await assert.rejects(
      () => generateQuestion(baseRequest(), { client }),
      (e) => e.status === 502 && /no structured output/i.test(e.message)
    );
  });
});

describe('generate — malformed model output', () => {
  it('no text block yields 502', async () => {
    const client = { messages: { stream: () => ({ finalMessage: async () => ({ content: [] }) }) } };
    await assert.rejects(() => generateQuestion(baseRequest(), { client }), (e) => e.status === 502);
  });

  it('non-JSON text yields 502', async () => {
    const client = { messages: { stream: () => ({ finalMessage: async () => ({ content: [{ type: 'text', text: 'not json' }] }) }) } };
    await assert.rejects(() => generateQuestion(baseRequest(), { client }), (e) => e.status === 502);
  });
});

describe('generate — schema enforces the §2.3 guarantee structurally', () => {
  it('subtopicCodes enum contains only the requested codes', () => {
    const schema = buildQuestionSchema(['SL5.9', 'SL5.8']);
    assert.deepEqual(schema.properties.subtopicCodes.items.enum, ['SL5.9', 'SL5.8']);
  });

  it('the model is not asked for injected fields', () => {
    const schema = buildQuestionSchema(['SL5.9']);
    for (const injected of ['course', 'level', 'paper', 'calculatorAllowed', 'difficultyPosition']) {
      assert.equal(injected in schema.properties, false, `schema asks for ${injected}`);
    }
  });

  it('requires the content fields the model IS responsible for', () => {
    const schema = buildQuestionSchema(['SL5.9']);
    assert.deepEqual(schema.required, ['subtopicCodes', 'totalMarks', 'totalLine', 'parts']);
  });
});

describe('generate — prompt composition', () => {
  it('instructions carry the calculator policy for a non-calculator paper', () => {
    const text = buildInstructions({
      course: 'AA', level: 'SL', paper: 'P1',
      subtopicCodes: ['SL5.9'], difficultyPosition: 'mid',
    });
    assert.match(text, /No calculator/);
    assert.match(text, /must not rely on any calculator method/);
  });

  it('instructions expect GDC methods on a calculator paper', () => {
    const text = buildInstructions({
      course: 'AI', level: 'SL', paper: 'P2',
      subtopicCodes: ['SL5.1'], difficultyPosition: 'mid',
    });
    assert.match(text, /graphic display calculator is assumed/i);
  });

  it('instructions include the sub-topic descriptions, not just the codes', () => {
    const text = buildInstructions({
      course: 'AA', level: 'SL', paper: 'P2',
      subtopicCodes: ['SL5.9'], difficultyPosition: 'mid',
    });
    assert.match(text, /SL5\.9/);
    assert.match(text, /Kinematics/i);
    assert.match(text, /Calculus/);   // topic name
  });

  it('each difficultyPosition produces distinct incline wording (§7)', () => {
    const make = (p) => buildInstructions({
      course: 'AA', level: 'SL', paper: 'P2',
      subtopicCodes: ['SL5.9'], difficultyPosition: p,
    });
    assert.match(make('early'), /EARLY/);
    assert.match(make('mid'), /MID-incline/);
    assert.match(make('late'), /LATE/);
  });

  it('instructions embed the mark-scheme and command-term guidance', () => {
    const text = buildInstructions({
      course: 'AA', level: 'SL', paper: 'P2',
      subtopicCodes: ['SL5.9'], difficultyPosition: 'mid',
    });
    assert.match(text, /Total: \[N marks\]/);       // §2.4
    assert.match(text, /Hence or otherwise/);        // command terms
    assert.match(text, /METHOD 1 \/ METHOD 2/);      // §5.5
  });

  it('the correction message lists every failing check', () => {
    const text = buildCorrection([
      { check: 'ahl-in-sl', message: 'AHL content in an SL question.' },
      { check: 'mark-format', message: 'Total line mismatch.' },
    ]);
    assert.match(text, /ahl-in-sl/);
    assert.match(text, /mark-format/);
    assert.match(text, /AHL content in an SL question/);
  });
});
