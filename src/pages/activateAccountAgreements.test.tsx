import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { AuthContext, type AuthContextValue } from "../lib/auth/AuthContext";
import { profileFor, signedInAuth } from "../lib/auth/authFixture";
import type { AccountType } from "../lib/auth/types";

const { legal, fee } = vi.hoisted(() => ({
  legal: {
    published: true,
    required: vi.fn<() => Promise<boolean>>(),
    missing: vi.fn(),
    accept: vi.fn(),
  },
  fee: { start: vi.fn(), reconcile: vi.fn() },
}));

vi.mock("../lib/legal/publish", () => ({ legalPagesPublished: () => legal.published }));
vi.mock("../lib/legal/acceptanceApi", () => ({
  fetchLegalAcceptanceRequired: () => legal.required(),
  fetchMissingAgreements: () => legal.missing(),
  acceptCurrentAgreements: (...args: unknown[]) => legal.accept(...args),
}));
vi.mock("../lib/signupFee/api", () => ({
  startSignupFeeCheckout: (...args: unknown[]) => fee.start(...args),
  reconcileSignupFeeCheckout: (...args: unknown[]) => fee.reconcile(...args),
}));

import { AppShell } from "../components/layout/AppShell";
import { ActivateAccountPage } from "./ActivateAccountPage";

const TERMS = { slug: "terms-of-use", title: "Terms of Service", version: 3, path: "/terms", audience: "ALL" };

function unpaid(type: AccountType): AuthContextValue {
  return signedInAuth(type, {
    user: { id: "user-1", email: "pat@example.com", email_confirmed_at: "2026-01-01" } as AuthContextValue["user"],
    profile: { ...profileFor(type), signup_fee_status: "UNPAID" },
    signup_fee_status: "UNPAID",
    signup_fee_enabled: true,
  });
}

function renderActivate(value: AuthContextValue, path = "/account/activate") {
  return render(
    <AuthContext.Provider value={value}>
      <MemoryRouter initialEntries={[path]}>
        <Routes>
          <Route element={<AppShell />}>
            <Route path="/account/activate" element={<ActivateAccountPage />} />
            <Route path="/" element={<h1>Marketing home</h1>} />
          </Route>
        </Routes>
      </MemoryRouter>
    </AuthContext.Provider>,
  );
}

describe("activation page: agreements and account settings", () => {
  beforeEach(() => {
    legal.published = true;
    legal.required.mockReset().mockResolvedValue(true);
    legal.missing.mockReset().mockResolvedValue([TERMS]);
    legal.accept.mockReset().mockResolvedValue({ error: null });
    fee.start.mockReset().mockResolvedValue({ checkout_url: null, already_paid: false });
    fee.reconcile.mockReset();
  });

  it("shows the acceptance prompt once on /account/activate and blocks the $9.99 checkout until accepted", async () => {
    const user = userEvent.setup();
    renderActivate(unpaid("CUSTOMER"));
    const prompt = await screen.findByRole("region", { name: /accept updated agreements/i });
    // Inline on the page, not duplicated as the AppShell banner.
    expect(screen.getAllByRole("region", { name: /accept updated agreements/i })).toHaveLength(1);
    expect(within(prompt).getByRole("link", { name: "Terms of Service" })).toHaveAttribute("href", "/terms");
    expect(await screen.findByText(/accept the current agreements above to continue/i)).toBeInTheDocument();
    const pay = screen.getByRole("button", { name: "Pay $9.99" });
    expect(pay).toBeDisabled();
    await user.click(pay);
    expect(fee.start).not.toHaveBeenCalled();

    legal.missing.mockResolvedValue([]);
    await user.click(within(prompt).getByRole("checkbox", { name: /i agree/i }));
    await user.click(within(prompt).getByRole("checkbox", { name: /18 or older/i }));
    await user.click(within(prompt).getByRole("button", { name: "Accept" }));
    await waitFor(() => expect(screen.queryByRole("region", { name: /accept updated agreements/i })).not.toBeInTheDocument());
    expect(legal.accept).toHaveBeenCalledTimes(1);
    const enabled = screen.getByRole("button", { name: "Pay $9.99" });
    expect(enabled).toBeEnabled();
    await user.click(enabled);
    expect(fee.start).toHaveBeenCalledTimes(1);
  });

  it("does not lock the checkout while the check is off or cannot run", async () => {
    legal.required.mockResolvedValue(false);
    const { unmount } = renderActivate(unpaid("CONTRACTOR"));
    await waitFor(() => expect(screen.getByRole("button", { name: "Pay $9.99" })).toBeEnabled());
    expect(screen.queryByRole("region", { name: /accept updated agreements/i })).not.toBeInTheDocument();
    unmount();

    legal.required.mockRejectedValue(new Error("network"));
    renderActivate(unpaid("CONTRACTOR"));
    await waitFor(() => expect(screen.getByRole("button", { name: "Pay $9.99" })).toBeEnabled());
  });

  it("still shows the banner on other pages a signed-in user lands on", async () => {
    renderActivate(unpaid("CUSTOMER"), "/");
    expect(await screen.findByRole("region", { name: /accept updated agreements/i })).toBeInTheDocument();
  });

  it.each([
    ["CUSTOMER", "/app/customer/account"],
    ["CONTRACTOR", "/app/pro/account"],
  ] as const)("links %s to Account settings from the activation page", async (type, href) => {
    legal.required.mockResolvedValue(false);
    renderActivate(unpaid(type));
    const main = screen.getByRole("main");
    expect(await within(main).findByRole("link", { name: "Account settings" })).toHaveAttribute("href", href);
  });
});
