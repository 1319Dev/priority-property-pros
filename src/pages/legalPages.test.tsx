import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it } from "vitest";
import { LegalFooterLinks } from "../components/legal/LegalFooterLinks";
import { legalPagesPublished } from "../lib/legal/publish";
import { PrivacyPage } from "./PrivacyPage";
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
    ]) {
      expect(readFileSync(path.join(repoRoot, relativePath), "utf8")).toMatch(/LegalFooterLinks/);
    }
  });

  it("renders the terms draft with the product rules and owner decisions", () => {
    const view = renderPage(<TermsPage />);
    const text = view.container.textContent ?? "";
    expect(screen.getByRole("heading", { name: /^terms of service$/i })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: /plain-language summary/i })).toBeInTheDocument();
    expect(text).toMatch(/this is not legal advice/i);
    expect(text).toMatch(/texas attorney/i);
    expect(text).toMatch(/Effective date:/);
    expect(text).toMatch(/\$9\.99/);
    expect(text).toMatch(/\$4\.99/);
    expect(text).toMatch(/up to three occupying connection slots/i);
    expect(text).toMatch(/independent business/i);
    expect(text).toMatch(/does not currently verify licenses, insurance, or workmanship/i);
    expect(text).toMatch(/30 days after it is posted/i);
    expect(text).toMatch(/does not currently give a customer a “block this pro” button/i);
    expect(screen.getAllByRole("link", { name: /prioritypropertypros@gmail.com/i }).length).toBeGreaterThan(0);
  });

  it("renders the privacy draft with processors, storage, and deletion", () => {
    const view = renderPage(<PrivacyPage />);
    const text = view.container.textContent ?? "";
    expect(screen.getByRole("heading", { name: /^privacy policy$/i })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: /plain-language summary/i })).toBeInTheDocument();
    expect(text).toMatch(/this is not legal advice/i);
    expect(text).toMatch(/does not store card numbers/i);
    expect(text).toMatch(/does not sell personal information/i);
    expect(text).toMatch(/Supabase/);
    expect(text).toMatch(/Stripe/);
    expect(text).toMatch(/GitHub Pages/);
    expect(text).toMatch(/Resend/);
    expect(text).toMatch(/local storage/i);
    expect(text).toMatch(/Texas Data Privacy and Security Act/);
    expect(text).toMatch(/Priority Help chat is not in the product today/);
    expect(screen.getByRole("link", { name: "/terms" })).toHaveAttribute("href", "/terms");
  });

  it("lists every owner decision the draft still needs", () => {
    const terms = readFileSync(path.join(repoRoot, "docs/legal/terms-of-service.md"), "utf8");
    const privacy = readFileSync(path.join(repoRoot, "docs/legal/privacy-policy.md"), "utf8");
    const combined = `${terms}\n${privacy}`;
    for (const phrase of [
      "Effective date: [OWNER DECISION:",
      "provide a mailing address",
      "set the minimum age",
      "confirm the legal refund policy",
      "choose arbitration or the courts",
      "choose the governing law and the Texas county for venue",
    ]) {
      expect(combined).toContain(phrase);
    }
    expect(terms).not.toMatch(/sk_live_/);
    expect(privacy).not.toMatch(/\d{1,5}\s+[A-Za-z]+\s+(Street|Avenue|Road)/);
  });

  it("shows footer links only when legal pages are published", () => {
    const hidden = renderPage(<LegalFooterLinks linkClassName="underline" />);
    expect(screen.queryByRole("link", { name: /^terms$/i })).not.toBeInTheDocument();
    hidden.unmount();
    renderPage(<LegalFooterLinks published linkClassName="underline" />);
    expect(screen.getByRole("link", { name: /^terms$/i })).toHaveAttribute("href", "/terms");
    expect(screen.getByRole("link", { name: /^privacy$/i })).toHaveAttribute("href", "/privacy");
  });
});
