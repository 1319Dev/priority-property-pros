import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { AuthContext, type AuthContextValue } from "./AuthContext";
import { RequireAdmin, RequireAuth, RequireRole } from "./guards";
import type { AccountStatus, AccountType, Profile } from "./types";

const { gate } = vi.hoisted(() => ({
  gate: {
    load: vi.fn(),
    verify: vi.fn(),
  },
}));

vi.mock("./adminMfaApi", () => ({
  loadAdminMfaGate: () => gate.load(),
  verifyAdminSignInCode: (...args: unknown[]) => gate.verify(...args),
}));

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
  beforeEach(() => {
    gate.load.mockReset();
    gate.verify.mockReset();
    gate.load.mockResolvedValue({ status: "allow" });
    gate.verify.mockResolvedValue({ error: null });
  });

  it("does not flash protected content while auth is loading", () => {
    renderGuard("/app/customer", auth({ loading: true, user: null }));
    expect(screen.queryByText("customer-home")).not.toBeInTheDocument();
    expect(screen.getByRole("status", { name: "Loading…" })).toBeInTheDocument();
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

  it("lets an admin through when the flag is off and no authenticator is enrolled", async () => {
    const p = profile("ADMIN");
    gate.load.mockResolvedValue({ status: "allow" });
    renderGuard(
      "/app/admin",
      auth({
        user: { id: "user-1", email: "garrett@example.com", email_confirmed_at: "2026-01-01" } as AuthContextValue["user"],
        profile: p,
        account_type: "ADMIN",
        account_status: "ACTIVE",
      }),
    );
    expect(await screen.findByText("admin-home")).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Enter your authenticator code." })).not.toBeInTheDocument();
  });

  it("shows the code step, including after password reset, before any admin page", async () => {
    const user = userEvent.setup();
    const p = profile("ADMIN");
    const signOut = vi.fn();
    gate.load
      .mockResolvedValueOnce({
        status: "challenge",
        factors: [{ id: "phone-1", friendlyName: "Phone", status: "verified", createdAt: "2026-10-01T00:00:00Z" }],
      })
      .mockResolvedValueOnce({ status: "allow" });
    renderGuard(
      "/app/admin",
      auth({
        user: { id: "user-1", email: "garrett@example.com", email_confirmed_at: "2026-01-01" } as AuthContextValue["user"],
        session: { access_token: "aal1-after-reset" } as AuthContextValue["session"],
        profile: p,
        account_type: "ADMIN",
        account_status: "ACTIVE",
        signOut,
      }),
    );

    expect(screen.queryByText("admin-home")).not.toBeInTheDocument();
    expect(await screen.findByRole("heading", { name: "Enter your authenticator code." })).toBeInTheDocument();
    await user.type(screen.getByLabelText("6-digit code"), "123456");
    await user.click(screen.getByRole("button", { name: "Verify" }));
    expect(gate.verify).toHaveBeenCalledWith("phone-1", "123456");
    expect(await screen.findByText("admin-home")).toBeInTheDocument();
  });

  it("blocks admin pages when the flag is on and the session is not aal2", async () => {
    const user = userEvent.setup();
    const p = profile("ADMIN");
    const signOut = vi.fn().mockResolvedValue(undefined);
    gate.load.mockResolvedValue({ status: "blocked" });
    renderGuard(
      "/app/admin",
      auth({
        user: { id: "user-1", email: "garrett@example.com", email_confirmed_at: "2026-01-01" } as AuthContextValue["user"],
        profile: p,
        account_type: "ADMIN",
        account_status: "ACTIVE",
        signOut,
      }),
    );
    expect(screen.queryByText("admin-home")).not.toBeInTheDocument();
    expect(await screen.findByRole("heading", { name: "Two-factor sign-in is required." })).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Sign out" }));
    expect(signOut).toHaveBeenCalled();
  });

  it("does not ask a customer for an authenticator code", async () => {
    const p = profile("CUSTOMER");
    renderGuard(
      "/app/customer",
      auth({
        user: { id: "user-1", email: "pat@example.com", email_confirmed_at: "2026-01-01" } as AuthContextValue["user"],
        profile: p,
        account_type: "CUSTOMER",
        account_status: "ACTIVE",
      }),
    );
    expect(await screen.findByText("customer-home")).toBeInTheDocument();
    expect(gate.load).not.toHaveBeenCalled();
    expect(screen.queryByRole("heading", { name: "Enter your authenticator code." })).not.toBeInTheDocument();
  });
});
