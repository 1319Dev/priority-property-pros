import { Link } from "react-router-dom";
import { legalPagesPublished } from "../../lib/legal/publish";

const LINKS = [
  { to: "/terms", label: "Terms" },
  { to: "/privacy", label: "Privacy" },
] as const;

export function LegalFooterLinks({
  published = legalPagesPublished(),
  className = "",
  linkClassName,
}: {
  published?: boolean;
  className?: string;
  linkClassName: string;
}) {
  if (!published) return null;
  return (
    <nav aria-label="Legal" className={className}>
      <ul className="flex flex-wrap items-center gap-x-4 gap-y-1">
        {LINKS.map((link) => (
          <li key={link.to}>
            <Link to={link.to} className={linkClassName}>
              {link.label}
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}
