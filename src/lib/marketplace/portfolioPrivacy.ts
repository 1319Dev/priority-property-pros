import type { PortfolioPrivacyState } from "./publicDirectory";

export const PORTFOLIO_REVIEW_NOTE =
  "New or edited photos are reviewed before customers see them.";

export function portfolioPrivacyLabel(state: PortfolioPrivacyState | string | null | undefined): string {
  if (state === "PUBLIC_SAFE") return "Approved";
  if (state === "PRIVATE") return "Hidden";
  return "Pending review";
}
