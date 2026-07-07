// Central Anthropic client. The API key lives ONLY on the server (loaded from
// server/.env via dotenv) and is never exposed to the frontend.
//
// Model default is Claude Opus 4.8 — the most capable model, appropriate for
// nuanced IB best-fit assessment. Override with SCORING_MODEL in .env (e.g.
// `claude-sonnet-5`) to trade some quality for lower cost during a pilot.

import Anthropic from '@anthropic-ai/sdk';

export const SCORING_MODEL = process.env.SCORING_MODEL || 'claude-opus-4-8';

let client = null;

export function getAnthropicClient() {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    const err = new Error(
      'Scoring is not configured: add ANTHROPIC_API_KEY to server/.env (see server/.env.example), then restart the server.'
    );
    err.status = 503; // Service Unavailable — configuration, not a client error
    err.expose = true; // safe, intentional message to surface to the user
    throw err;
  }
  if (!client) {
    client = new Anthropic({ apiKey });
  }
  return client;
}
