import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it } from "vitest";
import { LegalFooterLinks } from "../components/legal/LegalFooterLinks";
import { SignupAgreementLabel } from "../components/legal/SignupAgreementLabel";
import { LEGAL_DOCUMENTS } from "../lib/legal/catalog";
import { legalPagesPublished } from "../lib/legal/publish";
import { CommunityGuidelinesPage } from "./CommunityGuidelinesPage";
import { ContractorTermsPage } from "./ContractorTermsPage";
import { PrivacyPage } from "./PrivacyPage";
import { RefundPolicyPage } from "./RefundPolicyPage";
import { ReviewGuidelinesPage } from "./ReviewGuidelinesPage";
import { TermsPage } from "./TermsPage";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

function renderPage(ui: ReactNode) {
  return render(<MemoryRouter>{ui}</MemoryRouter>);
}

describe("draft legal pages", () => {
  it("publishes only when the build flag is the string true", () => {
    expect(legalPagesPublished(undefined)).toBe(false);
    expect(legalPagesPublished("")).toBe(false);
    expect(legalPagesPublished("false")).toBe(false);
    expect(legalPagesPublished("TRUE")).toBe(false);
    expect(legalPagesPublished("true")).toBe(true);
    expect(legalPagesPublished()).toBe(false);
    const app = readFileSync(path.join(repoRoot, "src/App.tsx"), "utf8");
    const workflow = readFileSync(path.join(repoRoot, ".github/workflows/ci-pages.yml"), "utf8");
    expect(app).toMatch(/import\.meta\.env\.VITE_PUBLISH_LEGAL_PAGES === "true"/);
    expect(workflow).toMatch(/VITE_PUBLISH_LEGAL_PAGES: \$\{\{ vars\.VITE_PUBLISH_LEGAL_PAGES \}\}/);
    for (const relativePath of [
      "src/components/layout/Footer.tsx",
      "src/components/layout/DashboardShell.tsx",
      "src/components/admin/AdminLayout.tsx",
      "src/pages/SignUpPage.tsx",
    ]) {
      expect(readFileSync(path.join(repoRoot, relativePath), "utf8")).toMatch(/LegalFooterLinks|SignupAgreementLabel/);
    }
    for (const route of LEGAL_DOCUMENTS.map((doc) => doc.path)) {
      expect(app).toContain(`path="${route}"`);
    }
  });

  it("renders every draft with the attorney notice and the product rules", () => {
    const pages = [
      TermsPage,
      PrivacyPage,
      RefundPolicyPage,
      CommunityGuidelinesPage,
      ContractorTermsPage,
      ReviewGuidelinesPage,
    ];
    const combined = pages
      .map((Page) => {
        const view = renderPage(<Page />);
        const text = view.container.textContent ?? "";
        view.unmount();
        return text;
      })
      .join("\n");
    expect(combined).toMatch(/this is not legal advice/i);
    expect(combined).toMatch(/texas attorney/i);
    expect(combined).toMatch(/Effective date:/);
    expect(combined).toMatch(/\$9\.99/);
    expect(combined).toMatch(/\$4\.99/);
    expect(combined).toMatch(/including a later project/i);
    expect(combined).toMatch(/up to three occupying connection slots/i);
    expect(combined).toMatch(/not the customer’s employer/i);
    expect(combined).toMatch(/not the general contractor/i);
    expect(combined).toMatch(/does not currently verify licenses, insurance, or workmanship/i);
    expect(combined).toMatch(/background-checked/);
    expect(combined).toMatch(/30 days after it is posted/i);
    expect(combined).toMatch(/Don't match me with this pro again/);
    expect(combined).toMatch(/support@prioritypropertypros.com/);
    expect(combined).not.toMatch(/prioritypropertypros@gmail.com/);
    expect(combined).toMatch(/does not store card numbers/i);
    expect(combined).toMatch(/does not sell personal information/i);
    expect(combined).toMatch(/Supabase/);
    expect(combined).toMatch(/Stripe/);
    expect(combined).toMatch(/GitHub Pages/);
    expect(combined).toMatch(/Resend/);
    expect(combined).toMatch(/local storage/i);
    expect(combined).toMatch(/Texas Data Privacy and Security Act/);
    expect(combined).toMatch(/Priority Help chat is not in the product today/);
    expect(combined).toMatch(/non-refundable/i);
    expect(combined).toMatch(/that setting ships off/i);
    expect(combined).toMatch(/stored separately as a sign-in/i);
    expect(combined).not.toMatch(/contractors are licensed, insured, and bonded/i);
    expect(combined).not.toMatch(/we background-check/i);
    expect(combined).not.toMatch(/must carry insurance/i);
    expect(screen.queryByText(/this is not legal advice/i)).not.toBeInTheDocument();
  });

  it("lists the owner decisions the drafts still need", () => {
    const legalDir = path.join(repoRoot, "docs/legal");
    const combined = readdirSync(legalDir)
      .filter((name) => name.endsWith(".md"))
      .map((name) => readFileSync(path.join(legalDir, name), "utf8"))
      .join("\n");
    for (const phrase of [
      "Effective date: [OWNER DECISION:",
      "provide a mailing address",
      "set the minimum age",
      "choose arbitration or the courts",
      "choose the governing law and the Texas county for venue",
    ]) {
      expect(combined).toContain(phrase);
    }
    expect(combined).not.toContain("confirm the legal refund policy");
    expect(combined).toMatch(/The \$9\.99 account activation fee is non-refundable/);
    expect(combined).toMatch(/The \$4\.99 Connection Fee is non-refundable/);
    expect(combined).not.toMatch(/sk_live_/);
    expect(combined).not.toMatch(/\d{1,5}\s+[A-Za-z]+\s+(Street|Avenue|Road)/);
  });

  it("shows footer and signup links only when legal pages are published", () => {
    const hidden = renderPage(<LegalFooterLinks linkClassName="underline" />);
    expect(screen.queryByRole("link", { name: /^terms$/i })).not.toBeInTheDocument();
    hidden.unmount();

    renderPage(<LegalFooterLinks published linkClassName="underline" />);
    expect(screen.getByRole("link", { name: /^terms$/i })).toHaveAttribute("href", "/terms");
    expect(screen.getByRole("link", { name: /^privacy$/i })).toHaveAttribute("href", "/privacy");
    expect(screen.getByRole("link", { name: /^refunds$/i })).toHaveAttribute("href", "/refunds");
    expect(screen.getByRole("link", { name: /^community$/i })).toHaveAttribute("href", "/community-guidelines");
    expect(screen.getByRole("link", { name: /^contractor terms$/i })).toHaveAttribute("href", "/contractor-terms");
    expect(screen.getByRole("link", { name: /^review guidelines$/i })).toHaveAttribute("href", "/content-guidelines");
  });

  it("names every required agreement on both signup forms and links them only when published", () => {
    const unpublished = renderPage(<SignupAgreementLabel accountType="CUSTOMER" published={false} />);
    expect(unpublished.container.textContent).toMatch(/Terms of Use/);
    expect(unpublished.container.textContent).toMatch(/Privacy Policy/);
    expect(unpublished.container.textContent).toMatch(/Refund & Cancellation Policy/);
    expect(unpublished.container.textContent).toMatch(/non-refundable/);
    expect(unpublished.container.textContent).not.toMatch(/Contractor Participation Terms/);
    expect(screen.queryByRole("link", { name: /terms of use/i })).not.toBeInTheDocument();
    unpublished.unmount();

    renderPage(<SignupAgreementLabel accountType="CONTRACTOR" published />);
    expect(screen.getByRole("link", { name: /contractor participation terms/i })).toHaveAttribute("href", "/contractor-terms");
    expect(screen.getByRole("link", { name: /refund & cancellation policy/i })).toHaveAttribute("href", "/refunds");
    expect(screen.getByText(/\$4\.99 Connection Fee are non-refundable/i)).toBeInTheDocument();
  });
});
