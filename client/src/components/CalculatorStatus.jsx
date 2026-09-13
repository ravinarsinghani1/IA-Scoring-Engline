// Read-only calculator status, derived from the taxonomy's own per-paper
// data (server: paperTypes.js) — never an interactive control. §10 item 3
// treats a wrong calculator assumption as a hard-fail, so this must always
// reflect the real IB policy (AA Paper 1 = no calculator; every other paper
// in both courses = GDC required) rather than something a teacher could set
// inconsistently with the paper they picked.

export default function CalculatorStatus({ taxonomy, paper }) {
  const info = taxonomy?.papers?.find((p) => p.paper === paper);
  if (!info) return null;
  const noCalc = info.calculator === 'none';
  return (
    <div
      className={`mb-3 inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-xs font-medium ${
        noCalc ? 'bg-amber-50 text-amber-700' : 'bg-slate-100 text-slate-600'
      }`}
    >
      <span aria-hidden="true" className={`h-1.5 w-1.5 rounded-full ${noCalc ? 'bg-amber-500' : 'bg-slate-400'}`} />
      {noCalc ? 'No calculator' : 'GDC required'}
    </div>
  );
}
