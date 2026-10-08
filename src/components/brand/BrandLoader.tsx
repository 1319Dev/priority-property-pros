import { useId } from "react";
import { cn } from "../../utils/cn";

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
  nav: "font-sans text-[0.65rem] font-medium leading-none text-ink-500",
} as const;

export function BrandLoader({
  label = "Loading…",
  layout = "section",
}: {
  label?: string;
  layout?: keyof typeof layoutClass;
}) {
  const gid = useId().replace(/:/g, "");
  const metalId = `${gid}-metal`;
  const handleId = `${gid}-handle`;
  const size = iconSize[layout];

  return (
    <div
      role="status"
      aria-live="polite"
      aria-label={label}
      className={cn("flex items-center justify-center text-center", layoutClass[layout])}
    >
      <svg
        viewBox="0 0 96 96"
        width={size}
        height={size}
        className="brand-loader-mark shrink-0 overflow-visible"
        aria-hidden="true"
      >
        <defs>
          <linearGradient id={handleId} x1="46" y1="40" x2="62" y2="40" gradientUnits="userSpaceOnUse">
            <stop offset="0%" stopColor="var(--color-forest-600)" />
            <stop offset="22%" stopColor="var(--color-forest-700)" />
            <stop offset="55%" stopColor="var(--color-forest-800)" />
            <stop offset="100%" stopColor="var(--color-forest-950)" />
          </linearGradient>
          <linearGradient id={metalId} x1="28" y1="14" x2="28" y2="44" gradientUnits="userSpaceOnUse">
            <stop offset="0%" stopColor="var(--color-gold-300)" />
            <stop offset="42%" stopColor="var(--color-gold-500)" />
            <stop offset="100%" stopColor="var(--color-gold-700)" />
          </linearGradient>
        </defs>

        <g transform="translate(8 0)">
          <rect x="54" y="74" width="32" height="6.5" rx="2" fill="var(--color-forest-800)" opacity="0.16" />
          <path
            d="M56.5 74.5 H84"
            stroke="var(--color-gold-600)"
            strokeWidth="1.3"
            strokeLinecap="round"
            fill="none"
          />
          <rect x="69.9" y="43.2" width="2.4" height="31" rx="0.7" fill="var(--color-gold-700)" />
          <rect x="64.8" y="39.8" width="12.4" height="4" rx="1.3" fill="var(--color-gold-500)" />
          <rect x="65.8" y="40.35" width="6.8" height="1.15" rx="0.5" fill="var(--color-gold-300)" />
        </g>

        <g className="brand-loader-impact">
          <path
            d="M78.6 36.2 V32.4 M83.2 37.4 L86.4 34.2 M74.2 37.4 L70.8 34.4 M85.2 42.2 L88.2 44.4"
            stroke="var(--color-gold-300)"
            strokeWidth="1.45"
            strokeLinecap="round"
            fill="none"
          />
          <circle cx="84.2" cy="33.2" r="1.15" fill="var(--color-gold-300)" />
          <circle cx="70.4" cy="39.6" r="0.95" fill="var(--color-gold-500)" />
          <circle cx="86.6" cy="40.2" r="0.8" fill="var(--color-gold-500)" />
        </g>

        <g className="brand-loader-swing">
          <g transform="translate(8 0)">
            <path
              fill={`url(#${handleId})`}
              d="M39.6 68 C39.3 78.4 42 86.4 46 86.4 C50 86.4 52.7 78.4 52.4 68 L50.7 39.4 C50.5 35.2 48.6 33.2 46 33.2 C43.4 33.2 41.5 35.2 41.3 39.4 Z"
            />
            <path
              d="M42.6 76.5 C42.4 62 42.8 48 43.6 40"
              stroke="var(--color-forest-600)"
              strokeWidth="1.7"
              strokeLinecap="round"
              fill="none"
            />
            <path
              d="M41.2 58.8 H50.6 M41 63.6 H50.9 M40.8 68.4 H51.2"
              stroke="var(--color-gold-300)"
              strokeWidth="1.35"
              strokeLinecap="round"
              fill="none"
            />
            <path
              fill={`url(#${metalId})`}
              stroke="var(--color-gold-700)"
              strokeWidth="0.6"
              strokeLinejoin="round"
              strokeLinecap="round"
              d="M72.4 22.6 C75.6 22.6 77.8 24.8 77.8 28 V35.2 C77.8 38.4 75.6 40.6 72.4 40.6 H62.4 V38.8 H43.2 C41 38.8 40 37.2 40.6 35.4 C34.6 36.4 28.4 33.6 23.6 28.6 C19.6 24.6 18.6 19.6 21 16.2 C22.4 14.2 25.2 14 26.6 16 C29.2 19.4 32.6 22.8 37 24.8 C34.4 22.6 32.2 19 31.6 15.8 C31.2 13.6 33.6 12.8 35.2 14.6 C37.6 17.4 40.2 21 43 23.2 C47 21.4 54 20.6 62 20.6 H66.2 V22.6 Z"
            />
            <rect x="73.6" y="25.4" width="2.7" height="12.6" rx="1.15" fill="var(--color-gold-700)" />
            <path
              d="M46 22.2 H66"
              stroke="var(--color-cream-50)"
              strokeWidth="1.35"
              strokeLinecap="round"
              fill="none"
              opacity="0.7"
            />
          </g>
        </g>
      </svg>
      <p className={labelClass[layout]}>{label}</p>
    </div>
  );
}
