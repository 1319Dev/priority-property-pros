import type { ButtonHTMLAttributes, ReactNode } from "react";
import { Link } from "react-router-dom";
import { cn } from "../../utils/cn";

const variants = {
  primary:
    "bg-forest-800 text-cream-50 hover:bg-forest-700 active:bg-forest-900",
  gold: "bg-gold-500 text-forest-950 hover:bg-gold-300 active:bg-gold-600",
  outline:
    "border border-forest-800/20 bg-cream-50 text-forest-800 hover:border-forest-800 hover:bg-cream-100",
  ghost: "bg-transparent text-forest-800 hover:bg-forest-800/8",
  cream: "bg-cream-50 text-forest-800 hover:bg-cream-100",
} as const;

const sizes = {
  md: "min-h-12 px-5 text-[0.8rem] tracking-[0.12em]",
  lg: "min-h-14 px-6 text-[0.85rem] tracking-[0.14em]",
  sm: "min-h-11 px-4 text-[0.72rem] tracking-[0.12em]",
} as const;

type Variant = keyof typeof variants;
type Size = keyof typeof sizes;

const shared =
  "inline-flex items-center justify-center rounded-full font-semibold uppercase transition-colors duration-200 disabled:pointer-events-none disabled:opacity-50";

export function Button({
  className,
  variant = "primary",
  size = "md",
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: Variant;
  size?: Size;
}) {
  return (
    <button className={cn(shared, variants[variant], sizes[size], className)} {...props} />
  );
}

export function ButtonLink({
  className,
  variant = "primary",
  size = "md",
  to,
  children,
}: {
  className?: string;
  variant?: Variant;
  size?: Size;
  to: string;
  children: ReactNode;
}) {
  return (
    <Link to={to} className={cn(shared, variants[variant], sizes[size], className)}>
      {children}
    </Link>
  );
}
