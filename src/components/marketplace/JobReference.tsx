import { useState } from "react";
import { copyText, formatProjectReference } from "../../lib/marketplace/projectReference";

/** Muted PPP-n label with tap-to-copy. Renders nothing until the number exists. */
export function JobReference({
  value,
  className = "",
  copy = true,
}: {
  value: number | string | null | undefined;
  className?: string;
  /** Turn off inside a link so the copy control is not nested in another interactive element. */
  copy?: boolean;
}) {
  const label = formatProjectReference(value);
  const [copied, setCopied] = useState(false);
  if (!label) return null;

  return (
    <span className={`flex flex-wrap items-center gap-1 text-xs text-ink-500 ${className}`}>
      <span className="font-medium tracking-wide">{label}</span>
      {copy ? (
        <button
          type="button"
          className="inline-flex min-h-11 items-center rounded-full px-2 font-semibold text-ink-500 underline decoration-ink-500/40 underline-offset-4"
          aria-label={copied ? `Copied ${label}` : `Copy ${label}`}
          onClick={() => {
            void copyText(label).then((ok) => {
              if (!ok) return;
              setCopied(true);
              window.setTimeout(() => setCopied(false), 1500);
            });
          }}
        >
          {copied ? "Copied" : "Copy"}
        </button>
      ) : null}
    </span>
  );
}
