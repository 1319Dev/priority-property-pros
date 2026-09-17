import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it } from "vitest";
import logoSvg from "./assets/logo.svg?url";
import wordmarkSvg from "./assets/wordmark.svg?url";
import App from "./App";
import { ToastProvider } from "./components/ui/Toast";
import {
  FEE_WHEN_HIRED_SENTENCE,
  HOMEOWNER_PRICING_SUMMARY,
  ORIGINAL_FEE_BRACKETS_PUBLIC,
  ORIGINAL_MAX_FEE,
  ORIGINAL_MIN_FEE,
  PRICING_HOMEPAGE_LINE,
  PRICING_PAGE_TITLE,
  PRO_PRICING_SUMMARY,
  REPEAT_FEE_RATE,
  REPEAT_MAX_FEE,
  REPEAT_MIN_FEE,
  SEE_PRICING_LABEL,
} from "./data/pricing";
import { SERVICES } from "./data/services";
import { AuthProvider } from "./lib/auth/AuthProvider";

function renderApp(path = "/") {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <AuthProvider>
        <ToastProvider>
          <App />
        </ToastProvider>
      </AuthProvider>
    </MemoryRouter>,
  );
}

describe("Priority Property Pros Phase 1 homepage (preserved)", () => {
  it("renders the app shell without crashing", () => {
    renderApp("/");
    expect(screen.getAllByLabelText(/priority property pros home/i).length).toBeGreaterThan(0);
  });

  it("shows the homepage customer tagline", () => {
    renderApp("/");
    const heading = screen.getByRole("heading", { level: 1 });
    expect(heading).toHaveTextContent(/your project/i);
    expect(heading).toHaveTextContent(/local pros/i);
    expect(heading).toHaveTextContent(/one simple place/i);
  });

  it("shows the marketplace tagline in wrapping HTML, not clipped SVG text", () => {
    const { container } = renderApp("/");
    expect(screen.getAllByText(/a marketplace, not a crew/i).length).toBeGreaterThan(0);
    const svgText = Array.from(container.querySelectorAll("svg text")).map((node) => node.textContent ?? "").join(" ");
    expect(svgText).not.toMatch(/a marketplace, not a crew/i);
  });

  it("lists the Phase 1 services including Handyman and Other", () => {
    renderApp("/");
    expect(screen.getByRole("button", { name: /handyman/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /other/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /tv mounting/i })).toBeInTheDocument();
    expect(SERVICES).toHaveLength(21);
  });

  it("renders header navigation targets", () => {
    renderApp("/");
    expect(screen.getAllByRole("link", { name: /find a pro/i }).length).toBeGreaterThan(0);
    expect(screen.getAllByRole("link", { name: /how it works/i }).length).toBeGreaterThan(0);
    expect(screen.getAllByRole("link", { name: /^pricing$/i }).length).toBeGreaterThan(0);
    expect(screen.getAllByRole("link", { name: /become a pro/i }).length).toBeGreaterThan(0);
    expect(screen.getAllByRole("link", { name: /sign in/i }).length).toBeGreaterThan(0);
  });

  it("includes original brand svg assets", () => {
    expect(logoSvg).toBeTruthy();
    expect(wordmarkSvg).toBeTruthy();
  });
});

describe("Phase 2 auth surfaces", () => {
  it("shows a real sign-in form instead of the Phase 1 stub", () => {
    renderApp("/sign-in");
    expect(screen.getByRole("heading", { name: /welcome back/i })).toBeInTheDocument();
    expect(screen.getByLabelText(/email/i)).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: /no accounts in phase 1/i })).not.toBeInTheDocument();
  });

  it("asks how you will use PPP and never offers Admin signup", () => {
    renderApp("/sign-up");
    expect(
      screen.getByRole("heading", { name: /how will you use priority property pros/i }),
    ).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /i need work done/i })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /i want to get hired/i })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /verify completed jobs/i })).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: /admin/i })).not.toBeInTheDocument();
    expect(screen.getByText(/no public admin signup/i)).toBeInTheDocument();
  });

  it("shows contractor foundation fields on contractor signup", () => {
    renderApp("/sign-up/contractor");
    expect(screen.getByLabelText(/business name/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/primary trade/i)).toBeInTheDocument();
  });

  it("shows email verification check-email state", () => {
    renderApp("/auth/verify?state=check-email");
    expect(screen.getByRole("heading", { name: /check your email/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /resend verification email/i })).toBeInTheDocument();
  });
});

describe("Phase 3 marketplace surfaces", () => {
  it("asks customers to sign in before posting", () => {
    renderApp("/post-project");
    expect(screen.getByRole("heading", { name: /sign in as a customer to post/i })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /preview only/i })).not.toBeInTheDocument();
  });

  it("keeps Phase 1 homepage posting CTA", () => {
    renderApp("/");
    expect(screen.getAllByRole("link", { name: /post a project/i }).length).toBeGreaterThan(0);
  });

  it("describes live posting with a max of three contractors on How it works", () => {
    renderApp("/how-it-works");
    expect(screen.getByText(/up to three local independents/i)).toBeInTheDocument();
    expect(screen.queryByText(/live posting is not on yet/i)).not.toBeInTheDocument();
    expect(screen.getAllByText(/online payment setup is coming soon/i).length).toBeGreaterThan(0);
  });
});

describe("Public marketplace pricing", () => {
  it("states free/fee messaging on the homepage and links to pricing", () => {
    renderApp("/");
    expect(screen.getByRole("heading", { name: PRICING_HOMEPAGE_LINE })).toBeInTheDocument();
    const seePricing = screen.getByRole("link", { name: SEE_PRICING_LABEL });
    expect(seePricing).toHaveAttribute("href", "/pricing");
  });

  it("publishes homeowner, pro, original, and repeat fee facts without processor jargon", () => {
    const { container } = renderApp("/pricing");
    expect(screen.getByRole("heading", { name: PRICING_PAGE_TITLE })).toBeInTheDocument();
    expect(screen.getByText(HOMEOWNER_PRICING_SUMMARY)).toBeInTheDocument();
    expect(screen.getByText(PRO_PRICING_SUMMARY)).toBeInTheDocument();
    expect(screen.getByText(FEE_WHEN_HIRED_SENTENCE)).toBeInTheDocument();
    for (const bracket of ORIGINAL_FEE_BRACKETS_PUBLIC) {
      expect(screen.getByText(bracket.range)).toBeInTheDocument();
      expect(screen.getAllByText(bracket.rate).length).toBeGreaterThan(0);
    }
    expect(screen.getByText(`Minimum ${ORIGINAL_MIN_FEE}. Maximum ${ORIGINAL_MAX_FEE}.`)).toBeInTheDocument();
    expect(screen.getByText(REPEAT_FEE_RATE)).toBeInTheDocument();
    expect(screen.getByText(`Minimum ${REPEAT_MIN_FEE}. Maximum ${REPEAT_MAX_FEE}.`)).toBeInTheDocument();
    expect(container.textContent).not.toMatch(/stripe|paymentintent|webhooks?|payments_live|charges_live|test mode/i);
  });
});
