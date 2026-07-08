// Authenticity gate.
//
// The teacher records the authenticity numbers (from Turnitin: similarity % and
// AI-content %) for their reference. Per the current policy the gate is NOT a
// hard block on the values — it passes with ANY percentage once a check has been
// recorded. The numbers are informational; the teacher decides what to do about
// them. Scoring is still gated on a check having been RECORDED, so nothing is
// scored on a draft whose authenticity hasn't been logged at all.

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
 * The gate passes with any recorded percentage (policy: record, don't block).
 * @returns {{ passed: boolean, reason: string|null }}
 */
export function evaluateGate() {
  return { passed: true, reason: null };
}

/**
 * Guard used by scoring endpoints. Returns null when scoring is allowed, or a
 * human-readable reason string when it must be blocked (HTTP 409). Scoring is
 * allowed once an authenticity check has been recorded (any values).
 */
export function gateBlockReason(draft) {
  if (!draft) return 'Draft not found.';
  const checked =
    draft.authenticity_similarity_score !== null &&
    draft.authenticity_similarity_score !== undefined &&
    draft.authenticity_ai_label_score !== null &&
    draft.authenticity_ai_label_score !== undefined;
  if (!checked) {
    return 'Record the authenticity numbers first (any percentage) to unlock scoring.';
  }
  return null;
}
