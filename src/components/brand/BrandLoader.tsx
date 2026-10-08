import { cn } from "../../utils/cn";
import { BrandMark } from "./Logo";

const layoutClass = {
  page: "min-h-[70vh] w-full flex-col gap-3 px-6 py-16",
  section: "min-h-36 w-full flex-col gap-3 px-4 py-8",
  inline: "h-11 w-28 shrink-0 flex-row gap-1.5 px-1",
  nav: "h-12 w-full max-w-16 shrink-0 flex-col gap-0 px-0.5 py-0",
} as const;

const iconSize = {
  page: 96,
  section: 80,
  inline: 28,
  nav: 22,
} as const;

const labelClass = {
  page: "font-sans text-sm font-medium tracking-wide text-ink-500",
  section: "font-sans text-sm font-medium text-ink-500",
  inline: "font-sans text-xs font-medium leading-none text-ink-500",
  nav: "sr-only",
} as const;

type Layout = keyof typeof layoutClass;

/** Every loader uses the house tile with a gold arc. */
export const FULL_PAGE_LOADER = "logo" as const;

export function BrandLoader({
  label = "Loading…",
  layout = "section",
}: {
  label?: string;
  layout?: Layout;
}) {
  const size = iconSize[layout];
  const showLabel = layout !== "nav";

  return (
    <div
      role="status"
      aria-live="polite"
      aria-label={label}
      className={cn("flex items-center justify-center text-center", layoutClass[layout])}
    >
      {FULL_PAGE_LOADER === "logo" ? <LogoArc size={size} /> : null}
      {showLabel ? <p className={labelClass[layout]}>{label}</p> : null}
    </div>
  );
}

/** Quiet placeholder for the header account slot and the bottom-nav account tab. */
export function LoaderSlot({ compact = false }: { compact?: boolean }) {
  return (
    <span
      role="status"
      aria-label="Loading…"
      className={cn(
        "inline-flex items-center",
        compact ? "h-12 w-full max-w-16 justify-center" : "h-11 w-28 justify-end",
      )}
    >
      <span
        className={cn("brand-loader-skeleton block rounded-full", compact ? "h-6 w-9" : "h-9 w-24")}
        aria-hidden="true"
      />
    </span>
  );
}

function LogoArc({ size }: { size: number }) {
  return (
    <span className="relative inline-grid shrink-0 place-items-center" style={{ width: size, height: size }}>
      <svg
        viewBox="0 0 72 72"
        width={size}
        height={size}
        className="brand-loader-arc absolute inset-0 h-full w-full"
        aria-hidden="true"
      >
        <circle
          cx="36"
          cy="36"
          r="32.5"
          fill="none"
          stroke="var(--color-gold-500)"
          strokeWidth="2.75"
          strokeLinecap="round"
          strokeDasharray="46 158"
        />
      </svg>
      <BrandMark decorative className="h-[68%] w-[68%]" />
    </span>
  );
}
