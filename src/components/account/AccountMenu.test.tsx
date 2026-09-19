import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ReactNode } from "react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";
import { AuthContext, type AuthContextValue } from "../../lib/auth/AuthContext";
import type { AccountStatus, AccountType, Profile } from "../../lib/auth/types";
import { AccountMenu } from "./AccountMenu";
import { DeleteAccountDialog } from "./DeleteAccountDialog";
import { Header } from "../layout/Header";
import { DashboardShell } from "../layout/DashboardShell";
import { AccountPage } from "../../pages/app/CustomerPages";

function profile(type: AccountType = "CUSTOMER", status: AccountStatus = "ACTIVE"): Profile {
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

function auth(partial: Partial<AuthContextValue> = {}): AuthContextValue {
  return {
    configured: true,
    loading: false,
    user: { id: "user-1", email: "pat@example.com" } as AuthContextValue["user"],
    session: null,
    profile: profile(),
    account_type: "CUSTOMER",
    account_status: "ACTIVE",
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

function renderWithAuth(ui: ReactNode, value: AuthContextValue = auth()) {
  return render(
    <AuthContext.Provider value={value}>
      <MemoryRouter>{ui}</MemoryRouter>
    </AuthContext.Provider>,
  );
}

describe("AccountMenu sign-out visibility", () => {
  it("shows an account menu for signed-in users and Sign out after one tap", async () => {
    const user = userEvent.setup();
    const signOut = vi.fn().mockResolvedValue(undefined);
    renderWithAuth(<AccountMenu />, auth({ signOut }));

    expect(screen.queryByRole("menuitem", { name: /sign out/i })).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: /account menu/i }));
    expect(screen.getByRole("menuitem", { name: /^sign out$/i })).toBeInTheDocument();
    expect(screen.getByRole("menuitem", { name: /your account/i })).toBeInTheDocument();
    expect(screen.getByRole("menuitem", { name: /delete account/i })).toBeInTheDocument();

    await user.click(screen.getByRole("menuitem", { name: /^sign out$/i }));
    expect(signOut).toHaveBeenCalledTimes(1);
  });

  it("is present on the public header and dashboard header when logged in", () => {
    renderWithAuth(
      <>
        <Header />
        <DashboardShell items={[{ to: "/app/customer", label: "Home", end: true }]} eyebrow="Customer" />
      </>,
    );
    expect(screen.getAllByRole("button", { name: /account menu/i }).length).toBe(2);
    expect(screen.queryByRole("link", { name: /sign in/i })).not.toBeInTheDocument();
  });

  it("keeps Sign In on the public header when logged out", () => {
    renderWithAuth(<Header />, auth({ user: null, profile: null, account_type: null, account_status: null }));
    expect(screen.getByRole("link", { name: /sign in/i })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /account menu/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /sign out/i })).not.toBeInTheDocument();
  });
});

describe("Delete account confirmation gating", () => {
  it("keeps Delete my account disabled until DELETE is typed", async () => {
    const user = userEvent.setup();
    const onConfirm = vi.fn();
    render(
      <DeleteAccountDialog open busy={false} onConfirm={onConfirm} onClose={() => undefined} />,
    );

    const confirm = screen.getByRole("button", { name: /delete my account/i });
    expect(confirm).toBeDisabled();
    await user.type(screen.getByLabelText(/type delete/i), "delete");
    expect(confirm).toBeDisabled();
    await user.clear(screen.getByLabelText(/type delete/i));
    await user.type(screen.getByLabelText(/type delete/i), "DELETE");
    expect(confirm).toBeEnabled();
    await user.click(confirm);
    expect(onConfirm).toHaveBeenCalledTimes(1);
  });

  it("shows Delete account on the account page", () => {
    renderWithAuth(<AccountPage />);
    expect(screen.getByRole("button", { name: /^sign out$/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /delete account/i })).toBeInTheDocument();
  });
});
