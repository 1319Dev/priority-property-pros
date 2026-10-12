import type { ReactNode } from "react";
import { readIncludeTest, writeIncludeTest } from "../../../lib/admin/includeTest";

export function AdminPageHeader({
  title,
  description,
  actions,
}: {
  title: string;
  description?: string;
  actions?: ReactNode;
}) {
  return (
    <header className="flex flex-wrap items-end justify-between gap-4">
      <div className="min-w-0">
        <p className="text-xs font-semibold uppercase tracking-[0.22em] text-gold-700">Admin</p>
        <h1 className="mt-2 font-display text-4xl font-semibold text-forest-800">{title}</h1>
        {description ? <p className="mt-3 max-w-2xl text-sm text-ink-700">{description}</p> : null}
      </div>
      {actions ? <div className="flex flex-wrap items-center gap-3">{actions}</div> : null}
    </header>
  );
}

export function AdminIncludeTestToggle({
  checked,
  onChange,
}: {
  checked: boolean;
  onChange: (value: boolean) => void;
}) {
  return (
    <label className="flex min-h-11 items-center gap-2 text-sm font-semibold text-forest-800">
      <input
        type="checkbox"
        className="size-4 accent-forest-800"
        checked={checked}
        onChange={(event) => {
          const next = event.target.checked;
          writeIncludeTest(next);
          onChange(next);
        }}
      />
      Include test accounts
    </label>
  );
}

export function initialIncludeTest(): boolean {
  return readIncludeTest();
}
