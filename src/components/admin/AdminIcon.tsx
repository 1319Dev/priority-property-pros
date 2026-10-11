import type { SVGProps } from "react";

export type AdminIconName =
  | "overview"
  | "approvals"
  | "reviews"
  | "bookings"
  | "security"
  | "contact"
  | "account"
  | "search"
  | "menu"
  | "close";

type IconProps = SVGProps<SVGSVGElement> & { name: AdminIconName };

const stroke = {
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.8,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
};

export function AdminIcon({ name, className = "h-5 w-5", ...props }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className={className} {...props}>
      {paths(name)}
    </svg>
  );
}

function paths(name: AdminIconName) {
  switch (name) {
    case "overview":
      return (
        <>
          <rect x="3.5" y="3.5" width="7" height="7" rx="1.5" {...stroke} />
          <rect x="13.5" y="3.5" width="7" height="7" rx="1.5" {...stroke} />
          <rect x="3.5" y="13.5" width="7" height="7" rx="1.5" {...stroke} />
          <rect x="13.5" y="13.5" width="7" height="7" rx="1.5" {...stroke} />
        </>
      );
    case "approvals":
      return (
        <>
          <path d="M8 4.5h8.2a2 2 0 0 1 2 2V19.5l-2.2-1.4-2.2 1.4-2.2-1.4-2.2 1.4-2.2-1.4-2.2 1.4V6.5a2 2 0 0 1 2-2Z" {...stroke} />
          <path d="M8.5 9.5h7M8.5 13h5" {...stroke} />
        </>
      );
    case "reviews":
      return (
        <path
          d="M12 3.8 14.1 8.6l5.2.5-3.9 3.4 1.2 5.1L12 15.2 7.4 17.6l1.2-5.1L4.7 9.1l5.2-.5L12 3.8Z"
          {...stroke}
        />
      );
    case "bookings":
      return (
        <>
          <rect x="4" y="5" width="16" height="14.5" rx="2" {...stroke} />
          <path d="M8 3.8v3M16 3.8v3M4 9.5h16" {...stroke} />
        </>
      );
    case "security":
      return (
        <>
          <rect x="6" y="10" width="12" height="9" rx="2" {...stroke} />
          <path d="M8.5 10V8a3.5 3.5 0 0 1 7 0v2" {...stroke} />
        </>
      );
    case "contact":
      return (
        <>
          <rect x="3.5" y="5.5" width="17" height="13" rx="2" {...stroke} />
          <path d="m4 7 8 6 8-6" {...stroke} />
        </>
      );
    case "account":
      return (
        <>
          <circle cx="12" cy="8" r="3.2" {...stroke} />
          <path d="M5.5 19.2a6.5 6.5 0 0 1 13 0" {...stroke} />
        </>
      );
    case "search":
      return (
        <>
          <circle cx="11" cy="11" r="6" {...stroke} />
          <path d="M15.8 15.8 20 20" {...stroke} />
        </>
      );
    case "menu":
      return <path d="M4 7h16M4 12h16M4 17h16" {...stroke} />;
    case "close":
      return <path d="M6 6 18 18M18 6 6 18" {...stroke} />;
    default:
      return null;
  }
}
