import { cn } from "../../utils/cn";

const layoutClass = {
  page: "min-h-[50vh] w-full flex-col gap-2 px-6 py-16",
  section: "min-h-36 w-full flex-col gap-2 px-4 py-8",
  inline: "h-11 w-28 shrink-0 flex-row gap-1.5 px-1",
  nav: "h-12 w-full max-w-16 shrink-0 flex-col gap-0 px-0.5 py-0",
} as const;

export function BrandLoader({
  label = "Loading…",
  layout = "section",
}: {
  label?: string;
  layout?: keyof typeof layoutClass;
}) {
  return (
    <div
      role="status"
      aria-live="polite"
      aria-label={label}
      className={cn("flex items-center justify-center text-center", layoutClass[layout])}
    >
      <svg
        viewBox="0 0 80 80"
        width={layout === "nav" ? 20 : layout === "inline" ? 22 : 64}
        height={layout === "nav" ? 20 : layout === "inline" ? 22 : 64}
        className="shrink-0"
        aria-hidden="true"
      >
        <g className="brand-loader-swing">
          <path
            d="M18 16 L46 44"
            fill="none"
            stroke="#1a3c2e"
            strokeWidth="5"
            strokeLinecap="round"
          />
          <rect x="38" y="30" width="26" height="10" rx="2" fill="#1a3c2e" transform="rotate(45 51 35)" />
          <rect x="54" y="28" width="8" height="10" rx="1.5" fill="#c9a227" transform="rotate(45 58 33)" />
        </g>
        <rect x="46" y="58" width="4" height="14" rx="1" fill="#c9a227" />
        <rect x="41" y="55" width="14" height="5" rx="1.5" fill="#1a3c2e" />
      </svg>
      <p className={cn("font-semibold text-forest-800", layout === "inline" || layout === "nav" ? "text-[0.65rem] leading-none" : "text-sm")}>
        {label}
      </p>
    </div>
  );
}
