import { render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { describe, expect, it } from "vitest";
import { LEGAL_DOCUMENTS, LEGAL_PAGES, ATTORNEY_REVIEW_REQUIRED } from "./legal";
import { TRUST_WHAT_DOES_NOT_EXIST, TRUST_WHAT_EXISTS } from "./trustSafety";
import { MARKETING_IMAGES } from "./marketingImages";
import {
  CONTRACTOR_VALUE_HEADLINE,
  NO_PAY_TO_WIN,
  ORIGINAL_FEE_BRACKETS_PUBLIC,
  PRIORITY_PRO_STATUS,
} from "./pricing";
import { ORIGINAL_FEE_BRACKETS, publicFeeBracketsFromConfig } from "../lib/marketplace/feeEngine";
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
    expect(screen.getByText(/live card charges/i)).toBeInTheDocument();
  });

  it("keeps the trust page honest about unimplemented features", () => {
    render(
      <MemoryRouter>
        <TrustPage />
      </MemoryRouter>,
    );
    expect(screen.getByRole("heading", { name: /trust & safety/i })).toBeInTheDocument();
    expect(TRUST_WHAT_EXISTS.some((item) => /anonymized/i.test(item.body))).toBe(true);
    expect(TRUST_WHAT_DOES_NOT_EXIST.some((item) => /escrow/i.test(item))).toBe(true);
    expect(screen.queryByText(/we verify every license/i)).not.toBeInTheDocument();
  });
});

describe("pricing schedule source of truth", () => {
  it("reads public brackets from the configured fee engine instead of inventing them", () => {
    expect(ORIGINAL_FEE_BRACKETS_PUBLIC).toEqual(
      publicFeeBracketsFromConfig(ORIGINAL_FEE_BRACKETS).map((row) => ({ range: row.range, rate: row.rate })),
    );
    expect(ORIGINAL_FEE_BRACKETS_PUBLIC[0]).toEqual({ range: "$0–$499.99", rate: "8%" });
    expect(PRIORITY_PRO_STATUS).toBe("Coming Soon");
    expect(CONTRACTOR_VALUE_HEADLINE).toMatch(/don.t pay for leads/i);
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
    expect(screen.getByText(/don.t pay for leads/i)).toBeInTheDocument();
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
