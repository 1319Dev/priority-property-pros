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

/**
 * The claw hammer reads at full-page and section sizes. At 24px the claw
 * collapses, so inline and nav use the house mark with a gold arc.
 */
function useHammer(layout: Layout) {
  return layout === "page" || layout === "section";
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
      <rect x="74" y="62.6" width="20" height="1.6" rx="0.8" fill="var(--color-gold-600)" />
      <rect x="85.9" y="46.3" width="1.45" height="17.8" rx="0.25" fill="var(--color-ink-500)" />
      <rect x="82.2" y="44.4" width="8.8" height="2.2" rx="0.4" fill="var(--color-ink-700)" />
      <g className="brand-loader-impact">
        <path
          d="M82.2 42.2 L79.4 39.6 M91.2 42.2 L94 39.6 M84.6 40.4 L82.8 37.2 M89.2 40.4 L91 37.2"
          stroke="var(--color-gold-300)"
          strokeWidth="1.5"
          strokeLinecap="round"
          fill="none"
        />
      </g>
      <g className="brand-loader-swing">
        <path fill="var(--color-gold-500)" d="M50 81.4 C49.6 85.2 62.4 85.2 62 81.4 L60.5 36 L51.5 36 Z" />
        <path fill="var(--color-gold-700)" d="M50.7 62.4 H61.3 L61.5 65.5 H50.5 Z" />
        <path
          fill="var(--color-forest-800)"
          d="M48 28 C39 26 31 20 24.5 13.5 C22 10 25.5 7.6 28.2 10.6 C31.5 15.4 39 21.5 48 24.6 Z"
        />
        <rect x="38" y="24" width="38" height="17" rx="2" fill="var(--color-forest-800)" />
        <path
          fill="var(--color-forest-950)"
          d="M72 25.4 H75.4 C76.9 25.4 77.8 26.3 77.8 27.6 V37.4 C77.8 38.7 76.9 39.6 75.4 39.6 H72 Z"
        />
        <rect x="49.2" y="38.2" width="13.6" height="7.2" rx="1.6" fill="var(--color-gold-500)" />
      </g>
    </svg>
  );
}
