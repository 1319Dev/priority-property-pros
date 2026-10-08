import { render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import type { ReactNode } from "react";
import { describe, expect, it } from "vitest";
import { Header } from "../../components/layout/Header";
import { Footer } from "../../components/layout/Footer";
import { CUSTOMER_ACTIVATION_NOTE, CUSTOMER_PAYS_DIRECTLY } from "../marketplace/customerCopy";
import { JOB_PAYMENT_PLAIN, PRICING_PAGE_TITLE } from "../../data/pricing";
import { Hero } from "../../features/home/Hero";
import { SimplePricing } from "../../features/home/SimplePricing";
import { ForContractors } from "../../features/home/ForContractors";
import { FaqPage } from "../../pages/FaqPage";
import { PricingPage } from "../../pages/PricingPage";
import { AccountPage } from "../../pages/app/CustomerPages";
import { AuthContext, type AuthContextValue } from "./AuthContext";
import { authValue, signedInAuth } from "./authFixture";

function renderAt(ui: ReactNode, value: AuthContextValue, path = "/") {
  return render(
    <AuthContext.Provider value={value}>
      <MemoryRouter initialEntries={[path]}>{ui}</MemoryRouter>
    </AuthContext.Provider>,
  );
}

const activated = signedInAuth("CUSTOMER", { signup_fee_enabled: true, signup_fee_status: "PAID" });
const unpaid = signedInAuth("CUSTOMER", { signup_fee_enabled: true, signup_fee_status: "UNPAID" });

describe("platform pricing visibility", () => {
  it("hides pricing navigation and marketing prices from an activated customer", () => {
    renderAt(
      <>
        <Header />
        <Hero />
        <SimplePricing />
        <Footer />
      </>,
      activated,
    );
    expect(screen.queryByRole("link", { name: /^pricing$/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: /one-time \$9\.99 account activation/i })).not.toBeInTheDocument();
    expect(screen.queryByText(/\$9\.99 one-time account activation/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/\$4\.99/i)).not.toBeInTheDocument();
    expect(screen.getByText(JOB_PAYMENT_PLAIN)).toBeInTheDocument();
  });

  it("keeps pricing for signed-out visitors and contractors", () => {
    const { unmount } = renderAt(<Header />, authValue());
    expect(screen.getByRole("link", { name: /^pricing$/i })).toBeInTheDocument();
    unmount();

    renderAt(<ForContractors />, signedInAuth("CONTRACTOR", { signup_fee_enabled: true, signup_fee_status: "PAID" }));
    expect(screen.getByText(/\$4\.99 only when you connect/i)).toBeInTheDocument();
    expect(screen.getByText(/\$9\.99 one-time account activation/i)).toBeInTheDocument();
  });

  it("still shows the $9.99 activation step before the fee is satisfied", () => {
    renderAt(
      <Routes>
        <Route path="/pricing" element={<PricingPage />} />
        <Route path="/app/customer" element={<h1>Customer home</h1>} />
      </Routes>,
      unpaid,
      "/pricing",
    );
    expect(screen.getByRole("heading", { name: PRICING_PAGE_TITLE })).toBeInTheDocument();
    expect(screen.getAllByText(/\$9\.99/i).length).toBeGreaterThan(0);
    expect(screen.queryByRole("heading", { name: /customer home/i })).not.toBeInTheDocument();
  });

  it("redirects an activated customer away from /pricing", () => {
    renderAt(
      <Routes>
        <Route path="/pricing" element={<PricingPage />} />
        <Route path="/app/customer" element={<h1>Customer home</h1>} />
      </Routes>,
      activated,
      "/pricing",
    );
    expect(screen.getByRole("heading", { name: /customer home/i })).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: PRICING_PAGE_TITLE })).not.toBeInTheDocument();
  });

  it("drops the account activation sentence after signup and keeps the direct-pay note", () => {
    const { unmount } = renderAt(<AccountPage />, activated);
    expect(screen.queryByText(CUSTOMER_ACTIVATION_NOTE, { exact: false })).not.toBeInTheDocument();
    expect(screen.getByText(CUSTOMER_PAYS_DIRECTLY, { exact: false })).toBeInTheDocument();
    unmount();

    renderAt(<AccountPage />, unpaid);
    expect(screen.getByText(CUSTOMER_ACTIVATION_NOTE, { exact: false })).toBeInTheDocument();
    expect(screen.getByText(CUSTOMER_PAYS_DIRECTLY, { exact: false })).toBeInTheDocument();
  });

  it("hides fee FAQs for an activated customer and keeps the job-payment answer", () => {
    renderAt(<FaqPage />, activated);
    expect(screen.queryByText(/what do homeowners and businesses pay/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/what do contractors pay/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/\$9\.99/)).not.toBeInTheDocument();
    expect(screen.queryByText(/\$4\.99/)).not.toBeInTheDocument();
    expect(screen.getByText(/who pays for the actual job/i)).toBeInTheDocument();
    expect(screen.getAllByText(JOB_PAYMENT_PLAIN).length).toBeGreaterThan(0);
  });
});
