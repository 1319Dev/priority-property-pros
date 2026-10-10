import type { PortfolioPrivacyState } from "./publicDirectory";

export const PORTFOLIO_REVIEW_NOTE =
  "Photos are reviewed before customers see them, usually within 1-2 business days.";

export function portfolioPrivacyLabel(state: PortfolioPrivacyState | string | null | undefined): string {
  if (state === "PUBLIC_SAFE") return "Approved";
  if (state === "PRIVATE") return "Hidden";
  return "Pending review";
}
