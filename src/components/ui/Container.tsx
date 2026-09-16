import type { ReactNode } from "react";
import { cn } from "../../utils/cn";

export function Container({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("mx-auto w-full max-w-6xl px-4 sm:px-6", className)}>
      {children}
    </div>
  );
}

export function SectionHeading({
  eyebrow,
  title,
  kicker,
}: {
  eyebrow: string;
  title: string;
  kicker?: string;
}) {
  return (
    <header className="max-w-2xl">
      <p className="text-[0.72rem] font-semibold uppercase tracking-[0.22em] text-gold-600">
        {eyebrow}
      </p>
      <h2 className="mt-2 font-display text-3xl font-semibold tracking-tight text-forest-800 sm:text-4xl">
        {title}
      </h2>
      {kicker ? <p className="mt-3 text-base leading-relaxed text-ink-700">{kicker}</p> : null}
    </header>
  );
}
