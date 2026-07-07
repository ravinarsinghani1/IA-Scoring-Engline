// Authenticity gate.
//
// In the real IA workflow the final version must pass an authenticity check
// before it can be scored or uploaded to IBIS: the similarity score and the
// AI-content label must BOTH be zero. This is a hard gate, not optional.
//
// For the MVP there is no live Turnitin / AI-detector integration, so the two
// scores are entered manually. The pass/fail rule, however, is enforced for
// real: scoring endpoints call `gateBlockReason()` and refuse to run until the
// gate passes. When a real detector is wired in later, only the INPUT changes —
// this rule and every caller stay the same.

// Maximum allowed values for the gate to pass. Kept as named constants so the
// policy is easy to find and adjust in one place (e.g. if a school later
// decides to allow a small non-zero similarity threshold).
export const SIMILARITY_MAX = 0; // percent
export const AI_LABEL_MAX = 0; // percent

/** Validate a raw score input. Returns a number in [0,100] or throws. */
export function parseScore(value, label) {
  const n = Number(value);
  if (!Number.isFinite(n) || n < 0 || n > 100) {
    const err = new Error(`${label} must be a number between 0 and 100`);
    err.status = 400;
    throw err;
  }
  return n;
}

/**
 * Decide whether the gate passes for a given pair of scores.
 * @returns {{ passed: boolean, reason: string|null }}
 */
export function evaluateGate({ similarityScore, aiLabelScore }) {
  const failures = [];
  if (similarityScore > SIMILARITY_MAX) {
    failures.push(`similarity score is ${similarityScore}% (must be ${SIMILARITY_MAX}%)`);
  }
  if (aiLabelScore > AI_LABEL_MAX) {
    failures.push(`AI-content label is ${aiLabelScore}% (must be ${AI_LABEL_MAX}%)`);
  }
  if (failures.length > 0) {
    return { passed: false, reason: `Authenticity gate blocked: ${failures.join('; ')}.` };
  }
  return { passed: true, reason: null };
}

/**
 * Guard used by scoring endpoints. Returns null when scoring is allowed, or a
 * human-readable reason string when it must be blocked (HTTP 409).
 */
export function gateBlockReason(draft) {
  if (!draft) return 'Draft not found.';
  const checked =
    draft.authenticity_similarity_score !== null &&
    draft.authenticity_similarity_score !== undefined &&
    draft.authenticity_ai_label_score !== null &&
    draft.authenticity_ai_label_score !== undefined;
  if (!checked) {
    return 'Authenticity gate has not been checked yet. Record the authenticity check before scoring.';
  }
  if (!draft.authenticity_gate_passed) {
    return evaluateGate({
      similarityScore: draft.authenticity_similarity_score,
      aiLabelScore: draft.authenticity_ai_label_score,
    }).reason;
  }
  return null;
}
