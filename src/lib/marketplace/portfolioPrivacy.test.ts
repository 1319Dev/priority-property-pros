import { describe, expect, it } from "vitest";
import { PORTFOLIO_REVIEW_NOTE, portfolioPrivacyLabel } from "./portfolioPrivacy";
import { toPublicSafePortfolioItem } from "./publicDirectory";

describe("portfolio privacy labels", () => {
  it("maps review states to customer-facing status", () => {
    expect(portfolioPrivacyLabel("REVIEW_REQUIRED")).toBe("Pending review");
    expect(portfolioPrivacyLabel("PUBLIC_SAFE")).toBe("Approved");
    expect(portfolioPrivacyLabel("PRIVATE")).toBe("Hidden");
    expect(portfolioPrivacyLabel(null)).toBe("Pending review");
    expect(PORTFOLIO_REVIEW_NOTE).toMatch(/reviewed before customers see them/i);
  });

  it("keeps non-public photos out of the storefront payload", () => {
    expect(
      toPublicSafePortfolioItem({
        id: "hidden",
        title: "Side yard",
        privacyState: "PRIVATE",
        storagePath: "user/portfolio/secret.jpg",
      }),
    ).toBeNull();
    expect(
      toPublicSafePortfolioItem({
        id: "waiting",
        title: "Side yard",
        privacyState: "REVIEW_REQUIRED",
      }),
    ).toBeNull();
    expect(
      toPublicSafePortfolioItem({
        id: "live",
        title: "Cedar panel",
        privacyState: "PUBLIC_SAFE",
        storagePath: "user/portfolio/secret.jpg",
      })?.caption,
    ).toBe("Cedar panel");
  });
});
