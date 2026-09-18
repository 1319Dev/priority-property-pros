import { render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { describe, expect, it } from "vitest";
import { LEGAL_DOCUMENTS, LEGAL_PAGES, ATTORNEY_REVIEW_REQUIRED } from "./legal";
import { TRUST_WHAT_DOES_NOT_EXIST, TRUST_WHAT_EXISTS } from "./trustSafety";
import { MARKETING_IMAGES } from "./marketingImages";
import {
  CONNECTION_FEE,
  CONNECTION_FEE_DESCRIPTION,
  CONTRACTOR_VALUE_HEADLINE,
  NO_PAY_TO_WIN,
  PRIORITY_PRO_STATUS,
} from "./pricing";
import { LegalIndexPage, LegalPage } from "../pages/LegalPage";
import { TrustPage } from "../pages/TrustPage";
import { PricingPage } from "../pages/PricingPage";

describe("legal and trust copy", () => {
  it("marks every legal page as needing attorney review", () => {
    for (const page of LEGAL_PAGES) {
      expect(LEGAL_DOCUMENTS[page.slug].attorneyReviewRequired).toBe(true);
      expect(LEGAL_DOCUMENTS[page.slug].sections.length).toBeGreaterThan(0);
    }
    expect(ATTORNEY_REVIEW_REQUIRED).toMatch(/attorney review required/i);
  });

  it("states PPP does not process project payments and checkout is not live", () => {
    const terms = LEGAL_DOCUMENTS.terms;
    const blob = terms.sections.map((s) => s.paragraphs.join("\n")).join("\n");
    expect(blob).toMatch(/does not process, hold in escrow, or payout homeowner-to-contractor project money/i);
    expect(blob).toMatch(/arrange project payment themselves/i);
    expect(blob).toMatch(/Online checkout is not live/i);
    expect(blob).toMatch(/\$9\.99.*activation/i);
    expect(blob).toMatch(/\$4\.99 Connection Fee/i);
    expect(blob).toMatch(/Homeowners join for \$0/i);
  });


  it("renders terms, privacy, and the legal index", () => {
    render(
      <MemoryRouter>
        <LegalIndexPage />
      </MemoryRouter>,
    );
    expect(screen.getByRole("heading", { name: /policies/i })).toBeInTheDocument();
    expect(screen.getAllByText(/attorney review required/i).length).toBeGreaterThan(0);
  });

  it("renders a privacy policy that reflects stored marketplace data", () => {
    render(
      <MemoryRouter initialEntries={["/legal/privacy"]}>
        <Routes>
          <Route path="/legal/:slug" element={<LegalPage />} />
        </Routes>
      </MemoryRouter>,
    );
    expect(screen.getByRole("heading", { name: /privacy policy/i })).toBeInTheDocument();
    expect(screen.getByText(/exact street/i)).toBeInTheDocument();
    expect(screen.getByText(/Connection Fee charges/i)).toBeInTheDocument();
  });

  it("keeps the trust page honest about unimplemented features", () => {
    render(
      <MemoryRouter>
        <TrustPage />
      </MemoryRouter>,
    );
    expect(screen.getByRole("heading", { name: /trust & safety/i })).toBeInTheDocument();
    expect(TRUST_WHAT_EXISTS.some((item) => /anonymized|generic trade/i.test(`${item.title} ${item.body}`))).toBe(true);
    expect(TRUST_WHAT_DOES_NOT_EXIST.some((item) => /escrow/i.test(item))).toBe(true);
    expect(screen.queryByText(/we verify every license/i)).not.toBeInTheDocument();
  });
});

describe("pricing schedule source of truth", () => {
  it("flat $4.99 Connection Fee model", () => {
    expect(CONNECTION_FEE).toBe("$4.99");
    expect(CONNECTION_FEE_DESCRIPTION).toMatch(/\$4\.99 flat Connection Fee/i);
    expect(PRIORITY_PRO_STATUS).toBe("Coming Soon");
    expect(CONTRACTOR_VALUE_HEADLINE).toMatch(/no lead fees.*no bid fees.*pay.*4\.99.*when you connect/i);
    expect(NO_PAY_TO_WIN).toMatch(/no pay-to-win/i);
  });

  it("shows a Free vs Priority Pro comparison and Coming Soon, not a purchase path", () => {
    render(
      <MemoryRouter>
        <PricingPage />
      </MemoryRouter>,
    );
    expect(screen.getByText(/free vs priority pro/i)).toBeInTheDocument();
    expect(screen.getAllByText(/coming soon/i).length).toBeGreaterThan(0);
    expect(screen.queryByRole("button", { name: /buy priority pro/i })).not.toBeInTheDocument();
    expect(screen.getAllByText(/\$4\.99/i).length).toBeGreaterThan(0);
  });
});

describe("marketing imagery", () => {
  it("ships four professional home-service stills without branded filenames", () => {
    expect(MARKETING_IMAGES).toHaveLength(4);
    for (const image of MARKETING_IMAGES) {
      expect(image.src).toMatch(/\/images\/marketing\/.+\.jpg$/);
      expect(image.alt).not.toMatch(/john|acme|license #|555-/i);
    }
  });
});
