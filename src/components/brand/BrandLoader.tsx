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
  inline: "font-sans text-[0.65rem] font-medium leading-none text-ink-500",
  nav: "sr-only",
} as const;

type Layout = keyof typeof layoutClass;

/** Full-page loader. Set to "logo" for the house tile with a gold arc. */
export const FULL_PAGE_LOADER: "hammer" | "logo" = "hammer";

function useHammer(layout: Layout) {
  if (layout === "page") return FULL_PAGE_LOADER === "hammer";
  return layout === "section";
}

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
      {useHammer(layout) ? <HammerMark size={size} /> : <LogoArc size={size} />}
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
        className="brand-loader-arc absolute inset-0"
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
          strokeDasharray="36 170"
        />
      </svg>
      <BrandMark decorative className="h-[68%] w-[68%]" />
    </span>
  );
}

function HammerMark({ size }: { size: number }) {
  return (
    <svg
      viewBox="0 0 96 96"
      width={size}
      height={size}
      className="brand-loader-mark shrink-0 overflow-visible"
      aria-hidden="true"
    >
      <rect x="64" y="67.2" width="30" height="2.4" rx="1.2" fill="var(--color-gold-600)" />
      <rect x="75.4" y="53.2" width="3.4" height="16" rx="0.6" fill="var(--color-ink-500)" />
      <rect x="69.2" y="49.2" width="15.6" height="4.6" rx="1" fill="var(--color-ink-700)" />
      <g className="brand-loader-impact">
        <path
          d="M71.5 47.4 L67.6 43.8 M82.6 47.4 L86.6 43.6 M74.4 45.2 L72 41.2 M80 45.2 L82.6 41"
          stroke="var(--color-gold-300)"
          strokeWidth="1.7"
          strokeLinecap="round"
          fill="none"
        />
      </g>
      <g className="brand-loader-swing">
        <path fill="var(--color-gold-500)" d="M50.2 81.6 C49.6 86.2 64.4 86.2 63.8 81.6 L61.2 38 L52.8 38 Z" />
        <path fill="var(--color-gold-700)" d="M51.6 64.4 H62.2 L62.5 67.6 H51.3 Z" />
        <path
          fill="var(--color-forest-800)"
          d="M38 46.5 C26 48 16 54 13 61 C11.2 66.5 17 70.5 22.5 67 C28 63.5 33 57 38 53 Z"
        />
        <path
          fill="var(--color-forest-800)"
          d="M40 28 C28 31 18 38 15 46 C13 52 18 58 24 55.5 C30 53 35 47 40 43 Z"
        />
        <rect x="34" y="28" width="44" height="18.5" rx="2.2" fill="var(--color-forest-800)" />
        <path
          fill="var(--color-forest-900)"
          d="M67 26 H74 C81.6 26 86.2 30.8 86.2 38.2 C86.2 45.6 81.6 50.6 74 50.6 H67 Z"
        />
        <rect x="52.6" y="42.6" width="12.8" height="7" rx="1.8" fill="var(--color-gold-500)" />
      </g>
    </svg>
  );
}
