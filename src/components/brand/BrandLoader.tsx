import { useId } from "react";
import { cn, withBase } from "../../utils/cn";

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

/** Full-page, section, and inline loaders use the circular logo. */
export const FULL_PAGE_LOADER = "logo" as const;

/** Navy and green sampled from the circular logo (ring mode, roof median). */
const LOADER_NAVY = "#002450";
const LOADER_GREEN = "#53A217";

const RING_VIEWBOX = 72;
const RING_STROKE = 3.05;
/** Keeps the antialiased stroke inside the box so the circle is not flattened at the sides. */
const RING_INSET = 1.2;
const RING_RADIUS = RING_VIEWBOX / 2 - RING_INSET - RING_STROKE / 2;
/** Inner artwork diameter divided by the loader box, so the mark meets the ring. */
const MARK_RATIO = (2 * (RING_RADIUS - RING_STROKE / 2)) / RING_VIEWBOX;

const MARK_256_WEBP = "brand/ppp-loader-mark-256.webp";
const MARK_512_WEBP = "brand/ppp-loader-mark-512.webp";
const MARK_256_PNG = "brand/ppp-loader-mark-256.png";
const MARK_512_PNG = "brand/ppp-loader-mark-512.png";

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
  const gradientId = `brand-loader-sweep-${useId().replace(/:/g, "")}`;
  const mark = Math.round(size * MARK_RATIO);
  const webpSrcSet = `${withBase(MARK_256_WEBP)} 256w, ${withBase(MARK_512_WEBP)} 512w`;
  const pngSrcSet = `${withBase(MARK_256_PNG)} 256w, ${withBase(MARK_512_PNG)} 512w`;

  return (
    <span className="relative inline-grid shrink-0 place-items-center" style={{ width: size, height: size }}>
      <svg
        viewBox={`0 0 ${RING_VIEWBOX} ${RING_VIEWBOX}`}
        width={size}
        height={size}
        className="brand-loader-arc absolute inset-0 h-full w-full"
        aria-hidden="true"
      >
        <defs>
          <linearGradient id={gradientId} gradientUnits="userSpaceOnUse" x1="69.3" y1="36" x2="29.8" y2="68.7">
            <stop offset="0%" stopColor={LOADER_NAVY} />
            <stop offset="42%" stopColor={LOADER_NAVY} />
            <stop offset="100%" stopColor={LOADER_GREEN} />
          </linearGradient>
        </defs>
        <circle cx="36" cy="36" r={RING_RADIUS} fill="none" stroke={LOADER_NAVY} strokeWidth={RING_STROKE} />
        <circle
          cx="36"
          cy="36"
          r={RING_RADIUS}
          fill="none"
          stroke={`url(#${gradientId})`}
          strokeWidth={RING_STROKE}
          strokeLinecap="round"
          pathLength="100"
          strokeDasharray="28 72"
        />
      </svg>
      <picture style={{ width: mark, height: mark }}>
        <source type="image/webp" srcSet={webpSrcSet} sizes={`${mark}px`} />
        <img
          src={withBase(MARK_512_PNG)}
          srcSet={pngSrcSet}
          sizes={`${mark}px`}
          alt=""
          width={mark}
          height={mark}
          decoding="sync"
          fetchPriority="high"
          draggable={false}
          className="brand-loader-mark pointer-events-none block h-full w-full select-none"
        />
      </picture>
    </span>
  );
}
