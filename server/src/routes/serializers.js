// Maps DB rows to API shapes. Notably converts SQLite 0/1 integer booleans to
// real JSON booleans so the frontend never has to know about the storage quirk.

export function serializeDraft(row) {
  if (!row) return row;
  return {
    ...row,
    authenticity_gate_passed: Boolean(row.authenticity_gate_passed),
  };
}

export function serializeScore(row) {
  if (!row) return row;
  return {
    ...row,
    changed_since_last_draft: Boolean(row.changed_since_last_draft),
    review_recommended: Boolean(row.review_recommended),
  };
}
