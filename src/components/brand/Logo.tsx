import { cn } from "../../utils/cn";

type MarkProps = {
  className?: string;
  title?: string;
  decorative?: boolean;
};

export function BrandMark({ className, title = "Priority Property Pros", decorative = false }: MarkProps) {
  return (
    <svg
      viewBox="0 0 64 64"
      className={cn("block", className)}
      role={decorative ? undefined : "img"}
      aria-hidden={decorative ? true : undefined}
      aria-label={decorative ? undefined : title}
    >
      <rect width="64" height="64" rx="14" fill="#1A3C2E" />
      <path
        d="M12 32 L32 14 L52 32"
        fill="none"
        stroke="#C9A227"
        strokeWidth="3.6"
        strokeLinejoin="round"
        strokeLinecap="round"
      />
      <path
        d="M18 31 V50 H46 V31"
        fill="none"
        stroke="#FBF8F1"
        strokeWidth="3.2"
        strokeLinejoin="round"
      />
      <path
        d="M26 50 V36 M32 50 V34 M38 50 V36"
        fill="none"
        stroke="#E0C078"
        strokeWidth="3.2"
        strokeLinecap="round"
      />
    </svg>
  );
}

type LogoProps = {
  className?: string;
  markClassName?: string;
  inverted?: boolean;
  /** Ellipsize the wordmark when the header row is narrower than the logo. */
  truncateWordmark?: boolean;
};

export function Logo({ className, markClassName, inverted = false, truncateWordmark = false }: LogoProps) {
  return (
    <span className={cn("inline-flex items-center gap-2.5", truncateWordmark && "max-w-full min-w-0", className)}>
      <BrandMark className={cn("h-9 w-9 shrink-0", markClassName)} />
      <span className={cn("flex flex-col leading-none", truncateWordmark && "min-w-0")}>
        <span
          className={cn(
            "font-display text-[0.62rem] font-semibold tracking-[0.22em]",
            truncateWordmark && "truncate",
            inverted ? "text-gold-300" : "text-gold-600",
          )}
        >
          PRIORITY
        </span>
        <span
          className={cn(
            "font-display text-[1.05rem] font-semibold tracking-tight",
            truncateWordmark && "truncate",
            inverted ? "text-cream-50" : "text-forest-800",
          )}
        >
          Property Pros
        </span>
      </span>
    </span>
  );
}

export function Wordmark({ inverted = false, className }: { inverted?: boolean; className?: string }) {
  return (
    <span className={cn("flex flex-col leading-none", className)}>
      <span
        className={cn(
          "font-display text-[0.7rem] font-semibold tracking-[0.28em]",
          inverted ? "text-gold-300" : "text-gold-600",
        )}
      >
        PRIORITY PROPERTY PROS
      </span>
      <span
        className={cn(
          "mt-1 font-display text-2xl font-semibold",
          inverted ? "text-cream-50" : "text-forest-800",
        )}
      >
        PPP
      </span>
    </span>
  );
}
