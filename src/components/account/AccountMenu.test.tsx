import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ReactNode } from "react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";
import { AuthContext, type AuthContextValue } from "../../lib/auth/AuthContext";
import { signedInAuth } from "../../lib/auth/authFixture";
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

    expect(screen.getByRole("button", { name: /account menu/i })).toHaveTextContent("Pat");
    expect(screen.getByRole("button", { name: /account menu/i })).toHaveTextContent("PL");
    expect(screen.queryByRole("menuitem", { name: /sign out/i })).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: /account menu/i }));
    expect(screen.getByRole("menuitem", { name: /my dashboard/i })).toHaveAttribute("href", "/app/customer");
    expect(screen.getByRole("menuitem", { name: /^sign out$/i })).toBeInTheDocument();
    expect(screen.getByRole("menuitem", { name: /^settings$/i })).toHaveAttribute(
      "href",
      "/app/customer/account",
    );
    expect(screen.queryByRole("menuitem", { name: /delete account/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /delete account/i })).not.toBeInTheDocument();

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

  it("does not flash Sign In while the session is loading", () => {
    renderWithAuth(<Header />, auth({ loading: true, user: null, profile: null, account_type: null, account_status: null }));
    expect(screen.getByRole("status", { name: "Loading…" })).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: /sign in/i })).not.toBeInTheDocument();
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
    await user.type(screen.getByLabelText(/type delete/i), "DELETE");
    expect(confirm).toBeDisabled();
    await user.type(screen.getByLabelText(/current password/i), "secret");
    expect(confirm).toBeEnabled();
    await user.click(confirm);
    expect(onConfirm).toHaveBeenCalledWith("secret");
  });

  it("shows Delete account only on account settings, below Sign out", async () => {
    const user = userEvent.setup();
    renderWithAuth(<AccountPage />);

    expect(screen.getByRole("heading", { name: /account settings/i })).toBeInTheDocument();
    const signOut = screen.getByRole("button", { name: /^sign out$/i });
    const deleteAccount = screen.getByRole("button", { name: /^delete account$/i });
    expect(signOut.compareDocumentPosition(deleteAccount) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();

    await user.click(deleteAccount);
    expect(screen.getByRole("heading", { name: /delete this account/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /delete my account/i })).toBeDisabled();
  });
});

describe("Delete account for each role at a phone width", () => {
  const roles = [
    ["CUSTOMER", "Customer"],
    ["CONTRACTOR", "Contractor"],
    ["ADMIN", "Admin"],
  ] as const;

  it.each(roles)("opens a full-width sheet for %s without someone else's private details", async (role, label) => {
    const user = userEvent.setup();
    renderWithAuth(<AccountPage />, signedInAuth(role));

    expect(screen.getByText(label)).toBeInTheDocument();
    expect(screen.queryByRole("img")).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /^delete account$/i }));
    const dialog = screen.getByRole("dialog", { name: /delete this account/i });
    expect(dialog.className).toContain("inset-x-0");
    expect(dialog.className).toContain("max-h-[100dvh]");
    expect(dialog.className).toContain("safe-area-inset-bottom");
    expect(dialog.querySelector("img")).toBeNull();
    expect(dialog.textContent ?? "").not.toMatch(/@/);
    expect(dialog.textContent ?? "").not.toMatch(/\d{3}[-.\s]\d{3}/);
    expect(dialog.textContent ?? "").not.toMatch(/\d+\s+\w+\s+(street|avenue|road|drive)/i);
    expect(dialog.textContent ?? "").not.toMatch(/deleted pro/i);

    const password = screen.getByLabelText(/current password/i);
    const confirmWord = screen.getByLabelText(/type delete/i);
    const confirm = screen.getByRole("button", { name: /delete my account/i });
    const keep = screen.getByRole("button", { name: /keep my account/i });
    for (const control of [password, confirmWord, confirm]) {
      expect(control.className).toContain("w-full");
      expect(control.className).toContain("min-h-14");
    }
    expect(keep.className).toContain("w-full");
    expect(keep.className).toContain("min-h-12");
    expect(confirm).toBeDisabled();
  });
});
