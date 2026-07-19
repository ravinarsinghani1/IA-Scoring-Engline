// Saaryavi wordmark: geometric diamond mark (rotated square + inset circle,
// drawn in CSS — no image asset) + "Saaryavi School" in Source Serif 4.

export default function Logo({ variant = 'dark', collapsed = false }) {
  const text = variant === 'light' ? 'text-white' : 'text-[var(--color-brand)]';
  return (
    <div className="flex items-center gap-2.5">
      <span
        aria-hidden="true"
        className="relative inline-flex h-7 w-7 rotate-45 items-center justify-center rounded-[6px] bg-[var(--color-accent)]"
      >
        <span className="h-2.5 w-2.5 -rotate-45 rounded-full bg-white/90" />
      </span>
      {!collapsed && (
        <span className={`font-serif text-lg font-bold tracking-tight ${text}`}>
          Saaryavi <span className="font-normal opacity-80">School</span>
        </span>
      )}
    </div>
  );
}
