import type { ReactNode } from "react";

export function AdminFilterField({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="block min-w-0 text-sm">
      <span className="mb-1.5 block text-xs font-semibold uppercase tracking-[0.16em] text-gold-700">{label}</span>
      {children}
    </label>
  );
}

export const adminFieldClass =
  "min-h-11 w-full rounded-2xl border border-forest-800/15 bg-cream-50 px-3 text-sm text-ink-900";
