import { Link } from "react-router-dom";
import { LEGAL_DOCUMENTS } from "../../lib/legal/catalog";
import { legalPagesPublished } from "../../lib/legal/publish";

const LINKS = LEGAL_DOCUMENTS.map((doc) => ({
  to: doc.path,
  label:
    doc.slug === "terms-of-use"
      ? "Terms"
      : doc.slug === "privacy-policy"
        ? "Privacy"
        : doc.slug === "refund-cancellation"
          ? "Refunds"
          : doc.slug === "community-guidelines"
            ? "Community"
            : doc.slug === "contractor-participation"
              ? "Contractor terms"
              : "Review guidelines",
}));

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
