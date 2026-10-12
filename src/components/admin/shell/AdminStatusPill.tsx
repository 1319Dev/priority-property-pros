export function AdminStatusPill({ label }: { label: string }) {
  return (
    <span className="inline-flex min-h-7 items-center rounded-full bg-cream-100 px-2.5 text-xs font-semibold uppercase tracking-[0.12em] text-forest-800">
      {label}
    </span>
  );
}
