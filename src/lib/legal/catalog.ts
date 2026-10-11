/**
 * Current legal documents. Version numbers must match the agreements rows in
 * supabase/migrations/20261018000001_legal_agreement_acceptance.sql.
 * This file does not include the document text. The pages load that text only
 * when VITE_PUBLISH_LEGAL_PAGES is "true".
 */

export type LegalAudience = "ALL" | "CONTRACTOR";

export type LegalDocument = {
  slug: string;
  title: string;
  version: number;
  path: string;
  audience: LegalAudience;
};

export const LEGAL_DOCUMENTS: readonly LegalDocument[] = [
  { slug: "terms-of-use", title: "Terms of Use", version: 3, path: "/terms", audience: "ALL" },
  { slug: "privacy-policy", title: "Privacy Policy", version: 2, path: "/privacy", audience: "ALL" },
  {
    slug: "refund-cancellation",
    title: "Refund & Cancellation Policy",
    version: 1,
    path: "/refunds",
    audience: "ALL",
  },
  {
    slug: "community-guidelines",
    title: "Community Guidelines",
    version: 1,
    path: "/community-guidelines",
    audience: "ALL",
  },
  {
    slug: "review-content",
    title: "Review & Content Guidelines",
    version: 1,
    path: "/content-guidelines",
    audience: "ALL",
  },
  {
    slug: "contractor-participation",
    title: "Contractor Participation Terms",
    version: 1,
    path: "/contractor-terms",
    audience: "CONTRACTOR",
  },
] as const;

export function requiredAgreements(accountType: string | null | undefined): LegalDocument[] {
  const contractor = accountType === "CONTRACTOR";
  return LEGAL_DOCUMENTS.filter((doc) => doc.audience === "ALL" || contractor);
}

/** JSON object of slug → version, stored in signup metadata and checked by the database. */
export function agreementVersionPayload(accountType: string | null | undefined): string {
  return JSON.stringify(
    Object.fromEntries(requiredAgreements(accountType).map((doc) => [doc.slug, doc.version])),
  );
}

export function agreementSentence(accountType: string | null | undefined): string {
  const titles = requiredAgreements(accountType).map((doc) => `the ${doc.title}`);
  if (titles.length === 0) return "I agree to the current legal agreements.";
  if (titles.length === 1) return `I agree to ${titles[0]}.`;
  const last = titles[titles.length - 1];
  return `I agree to ${titles.slice(0, -1).join(", ")}, and ${last}.`;
}
