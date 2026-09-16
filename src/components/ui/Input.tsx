import type { InputHTMLAttributes } from "react";
import { cn } from "../../utils/cn";

export function TextInput({
  label,
  hint,
  id,
  className,
  ...props
}: InputHTMLAttributes<HTMLInputElement> & {
  label: string;
  hint?: string;
}) {
  const inputId = id ?? props.name ?? "field";

  return (
    <label className="block" htmlFor={inputId}>
      <span className="mb-1.5 block text-[0.72rem] font-semibold uppercase tracking-[0.16em] text-gold-700">
        {label}
      </span>
      <input
        id={inputId}
        className={cn(
          "min-h-14 w-full rounded-2xl border border-forest-800/15 bg-cream-50 px-4 text-base text-ink-900 shadow-[inset_0_1px_0_rgba(255,255,255,0.7)] placeholder:text-ink-300",
          "focus-visible:border-gold-500",
          className,
        )}
        {...props}
      />
      {hint ? <span className="mt-1.5 block text-sm text-ink-500">{hint}</span> : null}
    </label>
  );
}
