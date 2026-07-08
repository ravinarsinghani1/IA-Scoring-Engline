// Validation logic: compare engine scores against known teacher (and optional
// IB-moderated) marks, and aggregate agreement across many validated
// explorations. This is the "how much can I trust it" harness.

const ORDER = ['A', 'B', 'C', 'D', 'E'];

/**
 * Build the per-criterion comparison for one exploration.
 * @param engineScores rows from criterion_score (raw): {criterion, engine_mark, range_low, range_high, confidence_tier, max_mark}
 * @param teacherMarks {A,B,C,D,E} (numbers; missing allowed)
 * @param ibMarks optional {A,B,C,D,E}
 */
export function computeComparison(engineScores, teacherMarks, ibMarks = {}) {
  const byCrit = Object.fromEntries(engineScores.map((s) => [s.criterion, s]));

  return ORDER.filter((k) => byCrit[k]).map((k) => {
    const s = byCrit[k];
    const isRange = s.confidence_tier === 'low';
    const teacher = numOrNull(teacherMarks?.[k]);
    const ib = numOrNull(ibMarks?.[k]);

    let delta = null;
    let agreement = null;

    if (teacher !== null) {
      if (isRange) {
        const lo = s.range_low;
        const hi = s.range_high;
        if (teacher >= lo && teacher <= hi) {
          delta = 0;
          agreement = 'within_range';
        } else if (teacher < lo) {
          delta = teacher - lo;
          agreement = 'off';
        } else {
          delta = teacher - hi;
          agreement = 'off';
        }
      } else {
        delta = teacher - s.engine_mark;
        agreement = delta === 0 ? 'exact' : Math.abs(delta) <= 1 ? 'within_1' : 'off';
      }
    }

    return {
      criterion: k,
      max_mark: s.max_mark,
      engine_mark: isRange ? null : s.engine_mark,
      engine_range_low: isRange ? s.range_low : null,
      engine_range_high: isRange ? s.range_high : null,
      teacher_mark: teacher,
      ib_moderated_mark: ib,
      agreement_delta: delta,
      agreement, // 'exact' | 'within_1' | 'within_range' | 'off' | null
    };
  });
}

/**
 * Aggregate stats per criterion across all validation_record rows.
 * @param rows validation_record rows (with engine_range_low/high)
 */
export function summarize(rows) {
  const perCriterion = {};
  for (const k of ORDER) perCriterion[k] = emptyStat(k);

  for (const r of rows) {
    if (r.teacher_mark === null || r.teacher_mark === undefined) continue;
    const stat = perCriterion[r.criterion];
    if (!stat) continue;
    stat.n += 1;

    if (r.criterion === 'C') {
      // Range criterion: agreement = teacher mark within suggested range.
      const within =
        r.engine_range_low !== null &&
        r.teacher_mark >= r.engine_range_low &&
        r.teacher_mark <= r.engine_range_high;
      if (within) stat.withinRange += 1;
      stat.sumAbsDelta += Math.abs(r.agreement_delta ?? 0);
    } else {
      const d = r.agreement_delta ?? 0;
      if (d === 0) stat.exact += 1;
      if (Math.abs(d) <= 1) stat.within1 += 1;
      stat.sumAbsDelta += Math.abs(d);
    }
  }

  for (const k of ORDER) {
    const s = perCriterion[k];
    s.meanAbsDelta = s.n ? +(s.sumAbsDelta / s.n).toFixed(2) : null;
    delete s.sumAbsDelta;
  }
  return perCriterion;
}

function emptyStat(criterion) {
  return {
    criterion,
    n: 0,
    exact: 0,
    within1: 0,
    withinRange: 0, // C only
    sumAbsDelta: 0,
    meanAbsDelta: null,
  };
}

function numOrNull(v) {
  if (v === '' || v === null || v === undefined) return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}
