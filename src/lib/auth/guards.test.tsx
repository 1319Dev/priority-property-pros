import { render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { describe, expect, it } from "vitest";
import { AuthContext, type AuthContextValue } from "./AuthContext";
import { RequireAdmin, RequireAuth, RequireRole } from "./guards";
import type { AccountStatus, AccountType, Profile } from "./types";

function profile(type: AccountType, status: AccountStatus = "ACTIVE"): Profile {
  return {
    id: "user-1",
    email: "pat@example.com",
    first_name: "Pat",
    last_name: "Lee",
    phone: null,
    avatar_url: null,
    account_type: type,
    account_status: status,
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-01T00:00:00Z",
  };
}

function auth(partial: Partial<AuthContextValue>): AuthContextValue {
  return {
    configured: true,
    loading: false,
    user: { id: "user-1", email: "pat@example.com" } as AuthContextValue["user"],
    session: null,
    profile: null,
    account_type: null,
    account_status: null,
    signup_fee_status: null,
    signup_fee_enabled: false,
    signIn: async () => ({ error: null }),
    signUp: async () => ({ error: null, needsEmailConfirm: true }),
    signOut: async () => undefined,
    refreshProfile: async () => undefined,
    requestPasswordReset: async () => ({ error: null }),
    updatePassword: async () => ({ error: null }),
    resendVerification: async () => ({ error: null }),
    ...partial,
  };
}

function renderGuard(entry: string, value: AuthContextValue) {
  return render(
    <AuthContext.Provider value={value}>
      <MemoryRouter initialEntries={[entry]}>
        <Routes>
          <Route element={<RequireAuth />}>
            <Route element={<RequireRole role="CUSTOMER" />}>
              <Route path="/app/customer" element={<div>customer-home</div>} />
            </Route>
            <Route element={<RequireAdmin />}>
              <Route path="/app/admin" element={<div>admin-home</div>} />
            </Route>
          </Route>
          <Route path="/sign-in" element={<div>sign-in</div>} />
          <Route path="/account/status" element={<div>status-page</div>} />
          <Route path="/account/activate" element={<div>activate-page</div>} />
          <Route path="/app/pro" element={<div>pro-home</div>} />
        </Routes>
      </MemoryRouter>
    </AuthContext.Provider>,
  );
}

describe("protected routes", () => {
  it("does not flash protected content while auth is loading", () => {
    renderGuard("/app/customer", auth({ loading: true, user: null }));
    expect(screen.queryByText("customer-home")).not.toBeInTheDocument();
    expect(screen.getByText(/priority property pros/i)).toBeInTheDocument();
  });

  it("redirects signed-out users to sign-in", () => {
    renderGuard("/app/customer", auth({ user: null, profile: null }));
    expect(screen.getByText("sign-in")).toBeInTheDocument();
    expect(screen.queryByText("customer-home")).not.toBeInTheDocument();
  });

  it("sends suspended users to the status page", () => {
    const p = profile("CUSTOMER", "SUSPENDED");
    renderGuard(
      "/app/customer",
      auth({
        user: { id: "user-1", email: "pat@example.com", email_confirmed_at: "2026-01-01" } as AuthContextValue["user"],
        profile: p,
        account_type: "CUSTOMER",
        account_status: "SUSPENDED",
      }),
    );
    expect(screen.getByText("status-page")).toBeInTheDocument();
  });

  it("keeps a contractor out of the customer dashboard", () => {
    const p = profile("CONTRACTOR", "PENDING");
    renderGuard(
      "/app/customer",
      auth({
        user: { id: "user-1", email: "pat@example.com", email_confirmed_at: "2026-01-01" } as AuthContextValue["user"],
        profile: p,
        account_type: "CONTRACTOR",
        account_status: "PENDING",
      }),
    );
    expect(screen.getByText("pro-home")).toBeInTheDocument();
    expect(screen.queryByText("customer-home")).not.toBeInTheDocument();
  });

  it("blocks non-admins from /app/admin", () => {
    const p = profile("CUSTOMER");
    renderGuard(
      "/app/admin",
      auth({
        user: { id: "user-1", email: "pat@example.com", email_confirmed_at: "2026-01-01" } as AuthContextValue["user"],
        profile: p,
        account_type: "CUSTOMER",
        account_status: "ACTIVE",
      }),
    );
    expect(screen.queryByText("admin-home")).not.toBeInTheDocument();
    expect(screen.getByText("customer-home")).toBeInTheDocument();
  });

  it("keeps current dashboards when signup fee checkout is disabled", () => {
    const p = profile("CUSTOMER");
    renderGuard(
      "/app/customer",
      auth({
        user: { id: "user-1", email: "pat@example.com", email_confirmed_at: "2026-01-01" } as AuthContextValue["user"],
        profile: { ...p, signup_fee_status: "UNPAID" },
        account_type: "CUSTOMER",
        account_status: "ACTIVE",
        signup_fee_status: "UNPAID",
        signup_fee_enabled: false,
      }),
    );
    expect(screen.getByText("customer-home")).toBeInTheDocument();
    expect(screen.queryByText("activate-page")).not.toBeInTheDocument();
  });

  it("sends unpaid customers to activate only when signup_fee_enabled is on", () => {
    const p = profile("CUSTOMER");
    renderGuard(
      "/app/customer",
      auth({
        user: { id: "user-1", email: "pat@example.com", email_confirmed_at: "2026-01-01" } as AuthContextValue["user"],
        profile: { ...p, signup_fee_status: "UNPAID" },
        account_type: "CUSTOMER",
        account_status: "ACTIVE",
        signup_fee_status: "UNPAID",
        signup_fee_enabled: true,
      }),
    );
    expect(screen.getByText("activate-page")).toBeInTheDocument();
    expect(screen.queryByText("customer-home")).not.toBeInTheDocument();
  });
});
