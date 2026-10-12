import { render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";
import { AuthContext, type AuthContextValue } from "./AuthContext";
import { profileFor, signedInAuth } from "./authFixture";
import { RequireAuth, RequireRole } from "./guards";
import { ACCOUNT_PAGES_WHILE_UNPAID, allowedWhileActivationPending } from "./roles";
import type { AccountType } from "./types";

vi.mock("./adminMfaApi", () => ({
  loadAdminMfaGate: async () => ({ status: "allow" }),
  verifyAdminSignInCode: async () => ({ error: null }),
}));

function unpaid(type: AccountType, partial: Partial<AuthContextValue> = {}): AuthContextValue {
  return signedInAuth(type, {
    user: { id: "user-1", email: "pat@example.com", email_confirmed_at: "2026-01-01" } as AuthContextValue["user"],
    profile: { ...profileFor(type, type === "CONTRACTOR" ? "PENDING" : "ACTIVE"), signup_fee_status: "UNPAID" },
    account_status: type === "CONTRACTOR" ? "PENDING" : "ACTIVE",
    signup_fee_status: "UNPAID",
    signup_fee_enabled: true,
    ...partial,
  });
}

const CUSTOMER_PAGES = ["projects", "projects/new/wizard", "messages", "bookings", "hire-again", "account/blocked"];
const PRO_PAGES = ["opportunities", "jobs", "messages", "billing", "estimates", "profile", "onboarding"];

function renderAt(entry: string, value: AuthContextValue) {
  return render(
    <AuthContext.Provider value={value}>
      <MemoryRouter initialEntries={[entry]}>
        <Routes>
          <Route element={<RequireAuth />}>
            <Route element={<RequireRole role="CUSTOMER" />}>
              <Route path="/app/customer" element={<div>customer-home</div>} />
              {CUSTOMER_PAGES.map((page) => (
                <Route key={page} path={`/app/customer/${page}`} element={<div>customer-{page}</div>} />
              ))}
              <Route path="/app/customer/account" element={<div>customer-account-settings</div>} />
              <Route path="/app/customer/notifications" element={<div>customer-notification-history</div>} />
              <Route path="/app/customer/account/notifications" element={<div>customer-notification-settings</div>} />
            </Route>
            <Route element={<RequireRole role="CONTRACTOR" />}>
              <Route path="/app/pro" element={<div>pro-home</div>} />
              {PRO_PAGES.map((page) => (
                <Route key={page} path={`/app/pro/${page}`} element={<div>pro-{page}</div>} />
              ))}
              <Route path="/app/pro/account" element={<div>pro-account-settings</div>} />
              <Route path="/app/pro/notifications" element={<div>pro-notification-history</div>} />
              <Route path="/app/pro/account/notifications" element={<div>pro-notification-settings</div>} />
            </Route>
          </Route>
          <Route path="/account/activate" element={<div>activate-page</div>} />
          <Route path="/account/status" element={<div>status-page</div>} />
        </Routes>
      </MemoryRouter>
    </AuthContext.Provider>,
  );
}

describe("unpaid accounts can still manage their account", () => {
  it("lists only account settings and notification pages", () => {
    expect([...ACCOUNT_PAGES_WHILE_UNPAID].sort()).toEqual(["/account", "/account/notifications", "/notifications"]);
    expect(allowedWhileActivationPending("/app/customer/account")).toBe(true);
    expect(allowedWhileActivationPending("/app/pro/account/")).toBe(true);
    expect(allowedWhileActivationPending("/app/pro/notifications")).toBe(true);
    expect(allowedWhileActivationPending("/app/customer/account/notifications")).toBe(true);
    for (const path of [
      "/app/customer",
      "/app/customer/projects",
      "/app/customer/account/blocked",
      "/app/pro",
      "/app/pro/billing",
      "/app/pro/messages",
      "/app/admin/account",
      "/app/verifier/account",
      "/app/customer/accountx",
      "/account",
    ]) {
      expect(allowedWhileActivationPending(path), path).toBe(false);
    }
  });

  it.each([
    ["CUSTOMER", "/app/customer/account", "customer-account-settings"],
    ["CUSTOMER", "/app/customer/notifications", "customer-notification-history"],
    ["CUSTOMER", "/app/customer/account/notifications", "customer-notification-settings"],
    ["CONTRACTOR", "/app/pro/account", "pro-account-settings"],
    ["CONTRACTOR", "/app/pro/notifications", "pro-notification-history"],
    ["CONTRACTOR", "/app/pro/account/notifications", "pro-notification-settings"],
  ] as const)("opens %s %s while the $9.99 is unpaid", (type, path, text) => {
    renderAt(path, unpaid(type));
    expect(screen.getByText(text)).toBeInTheDocument();
    expect(screen.queryByText("activate-page")).not.toBeInTheDocument();
  });

  it("maps another role's account page to the signed-in role's own account page", () => {
    renderAt("/app/customer/account", unpaid("CONTRACTOR"));
    expect(screen.getByText("pro-account-settings")).toBeInTheDocument();
  });

  it.each([
    ...["", ...CUSTOMER_PAGES.map((page) => `/${page}`)].map((rest) => ["CUSTOMER", `/app/customer${rest}`] as const),
    ...["", ...PRO_PAGES.map((page) => `/${page}`)].map((rest) => ["CONTRACTOR", `/app/pro${rest}`] as const),
  ])("keeps %s marketplace page %s behind activation", (type, path) => {
    renderAt(path, unpaid(type));
    expect(screen.getByText("activate-page")).toBeInTheDocument();
  });

  it("still sends a suspended unpaid account to the status page, even for settings", () => {
    renderAt("/app/customer/account", unpaid("CUSTOMER", { account_status: "SUSPENDED" }));
    expect(screen.getByText("status-page")).toBeInTheDocument();
  });

  it("does not change paid accounts", () => {
    renderAt("/app/pro/billing", unpaid("CONTRACTOR", { signup_fee_status: "PAID" }));
    expect(screen.getByText("pro-billing")).toBeInTheDocument();
  });
});
