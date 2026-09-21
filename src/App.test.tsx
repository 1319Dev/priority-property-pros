import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";
import logoSvg from "./assets/logo.svg?url";
import wordmarkSvg from "./assets/wordmark.svg?url";
import App from "./App";
import { ToastProvider } from "./components/ui/Toast";
import {
  CONNECTION_FEE_PER_LABEL,
  HOMEOWNER_PRICING_SUMMARY,
  PRICING_HOMEPAGE_LINE,
  PRICING_PAGE_TITLE,
  PRICING_PRIMARY,
  PRO_PRICING_SUMMARY,
  SEE_PRICING_LABEL,
  SIGNUP_FEE_ONE_TIME_LABEL,
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
    expect(screen.getByRole("tab", { name: "All types" })).toHaveAttribute("aria-selected", "true");
    expect(screen.getByRole("tab", { name: "Interior" })).toBeInTheDocument();
    expect(screen.getAllByRole("button", { name: /handyman/i }).length).toBeGreaterThan(0);
    expect(screen.getByRole("button", { name: /if it is a real local job/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /tv mounting/i })).toBeInTheDocument();
    expect(SERVICES).toHaveLength(21);
  });

  it("filters homepage services when a project-type tab is selected", async () => {
    const user = userEvent.setup();
    renderApp("/");
    await user.click(screen.getByRole("tab", { name: "Exterior" }));
    expect(screen.getByRole("tab", { name: "Exterior" })).toHaveAttribute("aria-selected", "true");
    const services = within(screen.getByRole("tabpanel", { name: "Exterior" }));
    expect(services.getByRole("button", { name: /fence repair/i })).toBeInTheDocument();
    expect(services.queryByRole("button", { name: /handyman/i })).not.toBeInTheDocument();
    expect(services.queryByRole("button", { name: /if it is a real local job/i })).not.toBeInTheDocument();
  });

  it("shows the finished house photo and the marketplace need line without trade photos", () => {
    renderApp("/");
    expect(
      screen.getAllByText(/whatever your property needs, find the right local professional/i).length,
    ).toBeGreaterThan(0);
    expect(screen.getAllByAltText(/finished suburban home/i).length).toBeGreaterThan(0);
    expect(screen.queryByAltText(/property owner and a local professional/i)).not.toBeInTheDocument();
    expect(screen.queryByAltText(/fencing contractor/i)).not.toBeInTheDocument();
    expect(screen.queryByAltText(/lawn professional/i)).not.toBeInTheDocument();
    expect(screen.queryByAltText(/finish nailer/i)).not.toBeInTheDocument();
    expect(screen.queryByAltText(/p-trap slip nut/i)).not.toBeInTheDocument();
    expect(screen.queryByAltText(/electrician in safety glasses/i)).not.toBeInTheDocument();
  });

  it("does not render the retired Priority Verified teaser card", () => {
    renderApp("/");
    expect(screen.queryByText(/not available yet/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/optional documentation service/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/completion verifier/i)).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: /read trust & safety/i })).not.toBeInTheDocument();
    expect(screen.queryByText(/priority pro — coming soon/i)).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: /full trust notes/i })).toBeInTheDocument();
  });

  it("scrolls to the top when public nav changes the route", async () => {
    const user = userEvent.setup();
    const scrollTo = vi.fn();
    window.scrollTo = scrollTo;
    renderApp("/");
    scrollTo.mockClear();
    await user.click(screen.getAllByRole("link", { name: /find a pro/i })[0]);
    expect(screen.getByRole("heading", { name: /browse local independents/i })).toBeInTheDocument();
    expect(scrollTo).toHaveBeenCalled();
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

  it("shows labeled demo browse and $9.99 signup CTAs on Find a Pro", () => {
    renderApp("/find-a-pro");
    expect(screen.getByRole("heading", { name: /browse local independents/i })).toBeInTheDocument();
    expect(screen.getAllByText(/example \/ demo/i).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/view profile/i).length).toBeGreaterThan(0);
    expect(screen.getByRole("link", { name: /example fence pro/i })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /example handyman pro/i })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /example homeowner jordan/i })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /example verifier morgan/i })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /example: cedar fence repair/i })).toBeInTheDocument();
    expect(screen.getAllByRole("link", { name: /post a project/i }).length).toBeGreaterThan(0);
    expect(screen.getAllByRole("link", { name: /get estimates/i }).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/join priority property pros for a one-time \$9\.99 account activation/i).length).toBeGreaterThan(
      0,
    );
    expect(screen.queryByText(/free signup/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/example cedar ridge fence/i)).not.toBeInTheDocument();
  });
});

describe("Public marketplace pricing", () => {
  it("states the one-time account activation on the homepage and links to pricing", () => {
    renderApp("/");
    expect(screen.getByRole("heading", { name: PRICING_HOMEPAGE_LINE })).toBeInTheDocument();
    expect(screen.getAllByText(/\$0\/month/i).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/\$9\.99 one-time account activation/i).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/non-refundable/i).length).toBeGreaterThan(0);
    expect(screen.queryByText(/free to join/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/accounts are free/i)).not.toBeInTheDocument();
    const seePricing = screen.getByRole("link", { name: SEE_PRICING_LABEL });
    expect(seePricing).toHaveAttribute("href", "/pricing");
  });

  it("publishes homeowner, contractor, and $4.99 connection facts without processor jargon", () => {
    const { container } = renderApp("/pricing");
    expect(screen.getByRole("heading", { name: PRICING_PAGE_TITLE })).toBeInTheDocument();
    expect(screen.getByText(HOMEOWNER_PRICING_SUMMARY)).toBeInTheDocument();
    expect(screen.getByText(PRO_PRICING_SUMMARY)).toBeInTheDocument();
    expect(screen.getAllByText(PRICING_PRIMARY).length).toBeGreaterThan(0);
    expect(screen.getAllByText(SIGNUP_FEE_ONE_TIME_LABEL).length).toBeGreaterThan(0);
    expect(screen.getAllByText(CONNECTION_FEE_PER_LABEL).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/\$0\/month/i).length).toBeGreaterThan(0);
    expect(screen.queryByText(/priority pro — coming soon/i)).not.toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: /^priority pro$/i })).not.toBeInTheDocument();
    expect(container.textContent).not.toMatch(/8%|3\.5%|2\.5%/);
    expect(container.textContent).not.toMatch(/\$49\/month|\$499\/year/);
    expect(container.textContent).not.toMatch(/stripe|paymentintent|webhooks?|payments_live|charges_live|test mode/i);
    expect(container.textContent).not.toMatch(/free to join|free signup|accounts are free|pay when you win|no lead fees/i);
    expect(container.textContent).toMatch(/non-refundable/i);
    expect(screen.getByText(/are the \$9\.99 activation fee and \$4\.99 connection fee refundable/i)).toBeInTheDocument();
  });

  it("mentions the one-time account activation on signup and for-pros surfaces", () => {
    renderApp("/sign-up");
    expect(screen.getAllByText(/one-time \$9\.99 account activation/i).length).toBeGreaterThan(0);
    expect(screen.getByText(/not \$9\.99 a month/i)).toBeInTheDocument();
    expect(screen.queryByText(/free to join/i)).not.toBeInTheDocument();
  });
});
