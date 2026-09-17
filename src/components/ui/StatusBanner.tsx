export function StatusBanner({
  title,
  body,
  tone = "info",
}: {
  title: string;
  body: string;
  tone?: "info" | "warning" | "success";
}) {
  const toneClass =
    tone === "warning"
      ? "border-gold-600/40 bg-gold-500/15 text-forest-950"
      : tone === "success"
        ? "border-forest-800/15 bg-forest-50 text-forest-800"
        : "border-forest-800/10 bg-cream-100 text-forest-800";
  return (
    <aside className={`rounded-3xl border px-4 py-3 ${toneClass}`} aria-live="polite">
      <p className="font-semibold">{title}</p>
      <p className="mt-1 text-sm leading-relaxed">{body}</p>
    </aside>
  );
}

export function HumanStatus({ label }: { label: string }) {
  return (
    <p className="text-[0.72rem] font-semibold uppercase tracking-[0.22em] text-gold-600">{label}</p>
  );
}
