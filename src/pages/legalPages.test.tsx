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

  it("renders every document with the product rules and without a publish-review demand", () => {
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
    expect(combined).not.toMatch(/texas attorney/i);
    expect(combined).not.toMatch(/OWNER DECISION/);
    expect(combined).not.toMatch(/before it is published/i);
    expect(combined).toMatch(/Effective date:/);
    expect(combined).toMatch(/18 or older/);
    expect(combined).toMatch(/Montgomery County, Texas/);
    expect(combined).toMatch(/do not require arbitration/i);
    expect(combined).toMatch(/duplicate charge/i);
    expect(combined).toMatch(/\$9\.99/);
    expect(combined).toMatch(/\$4\.99/);
    expect(combined).toMatch(/including a later project/i);
    expect(combined).toMatch(/up to three occupying connection slots/i);
    expect(combined).toMatch(/Independent Marketplace and Contractor Responsibility/);
    // Owner rule: the support email appears only on /contact. Legal pages point to the Contact us page.
    expect(combined).not.toMatch(/@prioritypropertypros\.com/i);
    expect(combined).not.toMatch(/mailto:/i);
    expect(combined).toMatch(/Contact us page \(prioritypropertypros\.com\/contact\)/);
    expect(combined).toMatch(/5900 Balcones Drive STE 100, Austin, TX 78731 US/);
    // Refund wording matches the live automatic $4.99 refund (#136).
    expect(combined).not.toMatch(/does not send refunds to Stripe/i);
    expect(combined).not.toMatch(/Marking it for review is not a refund/i);
    expect(combined).toMatch(/non-refundable once the connection is delivered/i);
    expect(combined).toMatch(/refunds the \$4\.99 automatically/i);
    expect(combined).not.toMatch(/Resend/);
    expect(combined).toMatch(/Google Workspace/);
    expect(combined).toMatch(/Priority Help \(not yet available\)/);
    expect(combined).toMatch(/operates solely as an online marketplace connecting homeowners with independent third-party contractors/);
    expect(combined).toMatch(/unless expressly stated otherwise/);
    expect(combined).toMatch(/cannot legally be excluded/);
    expect(combined).toMatch(/does not currently verify licenses, insurance, or workmanship/i);
    expect(combined).toMatch(/background-checked/);
    expect(combined).toMatch(/30 days after it is posted/i);
    expect(combined).toMatch(/Don't match me with this pro again/);
    expect(combined).toMatch(/Contact us page/);
    expect(combined).not.toMatch(/prioritypropertypros@gmail.com/);
    expect(combined).toMatch(/does not store card numbers/i);
    expect(combined).toMatch(/does not sell personal information/i);
    expect(combined).toMatch(/Supabase/);
    expect(combined).toMatch(/Stripe/);
    expect(combined).toMatch(/GitHub Pages/);
    expect(combined).toMatch(/Google Workspace/);
    expect(combined).toMatch(/local storage/i);
    expect(combined).toMatch(/Texas Data Privacy and Security Act/);
    expect(combined).toMatch(/Priority Help chat \(not yet available\)/);
    expect(combined).toMatch(/OpenAI \(only if Priority Help is turned on\)/);
    expect(combined).not.toMatch(/applies once Priority Help is enabled/);
    expect(combined).not.toMatch(/pending activation|If and when PPP turns Priority Help on/);
    expect(combined).toMatch(/PPP stores the messages you type, the replies, and the times/);
    expect(combined).toMatch(/deleted automatically 90 days after its last message/);
    expect(combined).toMatch(/deleted automatically 365 days after it is resolved or closed/);
    expect(combined).toMatch(/after removing the email addresses, phone numbers, and street addresses that PPP’s filter detects/);
    expect(combined).toMatch(/abuse-monitoring logs for up to 30 days/);
    expect(combined).toMatch(/not used to train its models unless the customer opts in/);
    expect(combined).toMatch(/platform\.openai\.com\/docs\/guides\/your-data/);
    expect(combined).toMatch(/openai\.com\/enterprise-privacy/);
    expect(combined).toMatch(/cannot issue a refund, approve a refund exception/);
    expect(combined).not.toMatch(/Priority Help chat is not in the product today/);
    expect(combined).toMatch(/5900 Balcones Drive STE 100, Austin, TX 78731 US/);
    expect(combined).toMatch(/including before a paid Connect/);
    expect(combined).toMatch(/changed to neutral wording that does not name you/);
    expect(combined).toMatch(/non-refundable/i);
    expect(combined).not.toMatch(/ships off|requirement is turned on|requirement is off/i);
    expect(combined).toMatch(/stored separately from the acceptance recorded when the account was created/i);
    expect(combined).toMatch(/not a verification of your age/i);
    expect(combined).toMatch(/open, unaccepted offers/i);
    expect(combined).toMatch(/short-lived link/i);
    expect(combined).toMatch(/GPS coordinates/i);
    expect(combined).toMatch(/the app removes location information a camera stored in the file/i);
    expect(combined).toMatch(/If it cannot remove that information, the photo is not uploaded/);
    expect(combined).toMatch(/Photos uploaded before this change/);
    expect(combined).not.toMatch(/does not (currently )?remove (GPS )?location information/i);
    expect(combined).not.toMatch(/server rejects a shorter password/i);
    expect(combined).toMatch(/password-change screens do not accept a shorter one/);
    expect(combined).toMatch(/Deleted Pro/i);
    expect(combined).toMatch(/does not send Stripe a deletion notice/i);
    expect(combined).not.toMatch(/legal_acceptance_required/);
    expect(combined).not.toMatch(/age_18_affirmed_at/);
    expect(combined).not.toMatch(/published_at/);
    expect(combined).not.toMatch(/booking_review_edit_window_days/);
    expect(combined).not.toMatch(/Data API/);
    expect(combined).not.toMatch(/180 characters/);
    expect(combined).not.toMatch(/generic illustration/i);
    expect(combined).not.toMatch(/public pages do not receive the original file/i);
    expect(combined).not.toMatch(/public pages do not show the original file/i);
    expect(combined).not.toMatch(/contractors are licensed, insured, and bonded/i);
    expect(combined).not.toMatch(/we background-check/i);
    expect(combined).not.toMatch(/must carry insurance/i);
    expect(screen.queryByText(/this is not legal advice/i)).not.toBeInTheDocument();
  });

  it("keeps owner decisions and a street address out of the public documents", () => {
    const legalDir = path.join(repoRoot, "docs/legal");
    const combined = readdirSync(legalDir)
      .filter((name) => name.endsWith(".md"))
      .map((name) => readFileSync(path.join(legalDir, name), "utf8"))
      .join("\n");
    expect(combined).not.toMatch(/OWNER DECISION/);
    expect(combined).not.toMatch(/attorney/i);
    expect(combined).not.toMatch(/this draft/i);
    expect(combined).toMatch(/the date this version is published/);
    expect(combined).toMatch(/18 or older/);
    expect(combined).toMatch(/do not require arbitration/i);
    expect(combined).toMatch(/Montgomery County, Texas/);
    expect(combined).toMatch(/These terms do not require those disputes to be filed in Montgomery County/);
    expect(combined).not.toMatch(/reject_signup_or_connection_fee_refund/);
    expect(combined).not.toMatch(/needs_refund/);
    expect(combined).not.toMatch(/max_participating_contractors/);
    expect(combined).not.toMatch(/PKCE|VAPID|row-level security/i);
    expect(combined).toMatch(/1, 2, or 3 stars/);
    expect(combined).toMatch(/within 45 days/);
    expect(readFileSync(path.join(repoRoot, "docs/SUPPORT_PROCESS.md"), "utf8")).toMatch(
      /reject_signup_or_connection_fee_refund/,
    );
    expect(combined).not.toContain("confirm the legal refund policy");
    expect(combined).toMatch(/The \$9\.99 account activation fee is non-refundable/);
    expect(combined).toMatch(/The \$4\.99 Connection Fee is non-refundable/);
    expect(combined).toMatch(/unless expressly stated otherwise/);
    expect(combined).not.toMatch(/sk_live_/);
    expect(combined).not.toMatch(/\d{1,5}\s+[A-Za-z]+\s+(Street|Avenue|Road)/);
  });

  it("publishes the business mailing address in every document's contact section", () => {
    const address = "Priority Property Pros LLC, 5900 Balcones Drive STE 100, Austin, TX 78731 US";
    const files = [
      "terms-of-use.md",
      "privacy-policy.md",
      "refund-cancellation-policy.md",
      "community-guidelines.md",
      "contractor-participation-terms.md",
      "review-content-guidelines.md",
    ];
    for (const name of files) {
      const text = readFileSync(path.join(repoRoot, "docs/legal", name), "utf8");
      const contact = text.slice(text.search(/^## \d+\. Contact/m));
      expect(contact, name).toContain(address);
      expect(text, name).not.toMatch(/do not publish a street address|does not publish a street address/);
    }
    const privacy = readFileSync(path.join(repoRoot, "docs/legal/privacy-policy.md"), "utf8");
    const requests = privacy.slice(privacy.indexOf("**Privacy requests.**"), privacy.indexOf("## 10."));
    expect(requests).toContain(address);
    const refunds = readFileSync(path.join(repoRoot, "docs/legal/refund-cancellation-policy.md"), "utf8");
    const howToAsk = refunds.slice(refunds.indexOf("**How to ask.**"), refunds.indexOf("## 3."));
    expect(howToAsk).toContain(address);
  });

  it("describes account deletion as PR #90 finally behaves", () => {
    const privacy = readFileSync(path.join(repoRoot, "docs/legal/privacy-policy.md"), "utf8");
    const s8 = privacy.slice(privacy.indexOf("## 8."), privacy.indexOf("## 9."));
    expect(s8).toMatch(/one step\. If any part fails, none of them is made/);
    expect(s8).toMatch(/Contact us page \(prioritypropertypros\.com\/contact\)\]\(\/contact\)/);
    expect(s8).not.toMatch(/@prioritypropertypros\.com/);
    expect(s8).toMatch(/Account deletion request/);
    expect(s8).toMatch(/portfolio photos with their titles and captions, credential entries, services, service areas, and the Stripe Connect account record PPP stores/);
    expect(s8).toMatch(/Photos you added to your projects, both the records and the files/);
    expect(s8).toMatch(/changed to neutral wording that does not name you/);
    expect(s8).toMatch(/amount, the status, the Stripe references, and the dates\. They do not keep your name, email, phone, or address/);
    expect(s8).toMatch(/project descriptions, estimates and estimate notes, project messages, job reviews, and change orders/);
    expect(s8).toMatch(/browser information sent with that acceptance/);
    expect(s8).toMatch(/older internal security logs may contain an email address/);
    expect(s8).toMatch(/PPP does not close a contractor’s Stripe Connect account at Stripe/);
    expect(s8).not.toMatch(/are not cleared/);
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
    expect(unpublished.container.textContent).toMatch(/Terms of Service/);
    expect(unpublished.container.textContent).toMatch(/Privacy Policy/);
    expect(unpublished.container.textContent).toMatch(/Refund & Cancellation Policy/);
    expect(unpublished.container.textContent).toMatch(/non-refundable/);
    expect(unpublished.container.textContent).not.toMatch(/Contractor Participation Terms/);
    expect(screen.queryByRole("link", { name: /terms of service/i })).not.toBeInTheDocument();
    unpublished.unmount();

    renderPage(<SignupAgreementLabel accountType="CONTRACTOR" published />);
    expect(screen.getByRole("link", { name: /contractor participation terms/i })).toHaveAttribute("href", "/contractor-terms");
    expect(screen.getByRole("link", { name: /refund & cancellation policy/i })).toHaveAttribute("href", "/refunds");
    expect(screen.getByText(/\$4\.99 Connection Fee is non-refundable once the connection is delivered\. If you are charged but the connection can't be provided, the \$4\.99 is refunded automatically/i)).toBeInTheDocument();
  });
});
