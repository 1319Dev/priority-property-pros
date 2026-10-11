import { useId, type InputHTMLAttributes } from "react";
import { cn } from "../../utils/cn";

export function TextInput({
  label,
  hint,
  error,
  id,
  className,
  ...props
}: InputHTMLAttributes<HTMLInputElement> & {
  label: string;
  hint?: string;
  error?: string | null;
}) {
  const generatedId = useId();
  const inputId = id ?? props.name ?? generatedId;
  const hintId = hint ? `${inputId}-hint` : undefined;
  const errorId = error ? `${inputId}-error` : undefined;
  const describedBy = [props["aria-describedby"], hintId, errorId].filter(Boolean).join(" ") || undefined;

  return (
    <label className="block" htmlFor={inputId}>
      <span className="mb-1.5 block text-xs font-semibold uppercase tracking-[0.16em] text-gold-700">
        {label}
      </span>
      <input
        {...props}
        id={inputId}
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy}
        className={cn(
          "min-h-14 w-full rounded-2xl border border-forest-800/15 bg-cream-50 px-4 text-base text-ink-900 shadow-[inset_0_1px_0_rgba(255,255,255,0.7)] placeholder:text-ink-300",
          "focus-visible:border-gold-500",
          error ? "border-danger-600" : null,
          className,
        )}
      />
      {hint ? (
        <span id={hintId} className="mt-1.5 block text-sm text-ink-500">
          {hint}
        </span>
      ) : null}
      {error ? (
        <span id={errorId} className="mt-1.5 block text-sm text-danger-600">
          {error}
        </span>
      ) : null}
    </label>
  );
}
