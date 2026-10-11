import { render, screen, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { AdminLayout } from "../admin/AdminLayout";
import { AppShell } from "../layout/AppShell";
import { DashboardShell } from "../layout/DashboardShell";
import { AuthContext, type AuthContextValue } from "../../lib/auth/AuthContext";
import type { AccountStatus, AccountType, Profile } from "../../lib/auth/types";

const gate = vi.hoisted(() => ({
  pagesOn: false,
  fetchLegalAcceptanceRequired: vi.fn<() => Promise<boolean>>(),
  fetchMissingAgreements: vi.fn(),
  acceptCurrentAgreements: vi.fn(),
}));

vi.mock("../../lib/legal/publish", () => ({
  legalPagesPublished: () => gate.pagesOn,
}));

vi.mock("../../lib/legal/acceptanceApi", () => ({
  fetchLegalAcceptanceRequired: () => gate.fetchLegalAcceptanceRequired(),
  fetchMissingAgreements: () => gate.fetchMissingAgreements(),
  acceptCurrentAgreements: () => gate.acceptCurrentAgreements(),
}));

function profile(type: AccountType): Profile {
  return {
    id: "user-1",
    email: "pat@example.com",
    first_name: "Pat",
    last_name: "Lee",
    phone: null,
    avatar_url: null,
    account_type: type,
    account_status: "ACTIVE" as AccountStatus,
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-01T00:00:00Z",
  };
}

function auth(type: AccountType | null): AuthContextValue {
  const signedIn = type !== null;
  return {
    configured: true,
    loading: false,
    user: signedIn ? ({ id: "user-1", email: "pat@example.com" } as AuthContextValue["user"]) : null,
    session: null,
    profile: signedIn ? profile(type) : null,
    account_type: type,
    account_status: signedIn ? "ACTIVE" : null,
    signup_fee_status: null,
    signup_fee_enabled: false,
    signIn: async () => ({ error: null }),
    signUp: async () => ({ error: null, needsEmailConfirm: true }),
    signOut: async () => undefined,
    refreshProfile: async () => undefined,
    requestPasswordReset: async () => ({ error: null }),
    updatePassword: async () => ({ error: null }),
    resendVerification: async () => ({ error: null }),
  };
}

function renderRole(type: AccountType | null, ui: ReactNode) {
  return render(<AuthContext.Provider value={auth(type)}>{ui}</AuthContext.Provider>);
}

describe("legal chrome for each role", () => {
  beforeEach(() => {
    gate.pagesOn = false;
    gate.fetchLegalAcceptanceRequired.mockReset();
    gate.fetchLegalAcceptanceRequired.mockResolvedValue(false);
    gate.fetchMissingAgreements.mockReset();
    gate.fetchMissingAgreements.mockResolvedValue([]);
    gate.acceptCurrentAgreements.mockReset();
    gate.acceptCurrentAgreements.mockResolvedValue({ error: null });
  });

  it("keeps a signed-out visitor on the public page with no acceptance prompt", () => {
    renderRole(
      null,
      <MemoryRouter>
        <Routes>
          <Route element={<AppShell />}>
            <Route path="/" element={<p>Public home</p>} />
          </Route>
        </Routes>
      </MemoryRouter>,
    );
    expect(screen.getByText("Public home")).toBeInTheDocument();
    expect(screen.getAllByRole("link", { name: /sign in/i }).length).toBeGreaterThan(0);
    expect(screen.queryByRole("heading", { name: /please accept the current agreements/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: /^terms$/i })).not.toBeInTheDocument();
    expect(gate.fetchLegalAcceptanceRequired).not.toHaveBeenCalled();
  });

  it("shows published legal links to a signed-out visitor and still does not prompt", async () => {
    gate.pagesOn = true;
    gate.fetchLegalAcceptanceRequired.mockResolvedValue(true);
    renderRole(
      null,
      <MemoryRouter>
        <Routes>
          <Route element={<AppShell />}>
            <Route path="/" element={<p>Public home</p>} />
          </Route>
        </Routes>
      </MemoryRouter>,
    );
    expect(screen.getByText("Public home")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /^terms$/i })).toHaveClass("min-h-11");
    expect(screen.getByRole("link", { name: /^privacy$/i })).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: /please accept the current agreements/i })).not.toBeInTheDocument();
    expect(gate.fetchMissingAgreements).not.toHaveBeenCalled();
  });

  it.each([
    ["CUSTOMER", "Customer", "Kitchen project"],
    ["CONTRACTOR", "Priority Pro", "Open offers"],
  ] as const)("keeps %s data visible and hides the prompt while the setting is off", async (type, eyebrow, data) => {
    gate.pagesOn = true;
    renderRole(
      type,
      <MemoryRouter>
        <DashboardShell items={[{ to: "/app", label: "Home", end: true }]} eyebrow={eyebrow}>
          <p>{data}</p>
        </DashboardShell>
      </MemoryRouter>,
    );
    expect(screen.getByText(data)).toBeInTheDocument();
    expect(screen.getByText(`${eyebrow} · Pat Lee`)).toBeInTheDocument();
    expect(screen.getAllByRole("navigation", { name: "Dashboard" }).some((nav) => nav.className.includes("lg:hidden"))).toBe(
      true,
    );
    await waitFor(() => expect(gate.fetchLegalAcceptanceRequired).toHaveBeenCalled());
    expect(gate.fetchMissingAgreements).not.toHaveBeenCalled();
    expect(screen.queryByRole("heading", { name: /please accept the current agreements/i })).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: /^terms$/i })).toHaveClass("min-h-11");
  });

  it("prompts a customer without replacing the project", async () => {
    gate.pagesOn = true;
    gate.fetchLegalAcceptanceRequired.mockResolvedValue(true);
    gate.fetchMissingAgreements.mockResolvedValue([
      { slug: "terms-of-use", title: "Terms of Use", version: 3, path: "/terms", audience: "ALL" },
    ]);
    renderRole(
      "CUSTOMER",
      <MemoryRouter>
        <DashboardShell items={[{ to: "/app/customer", label: "Home", end: true }]} eyebrow="Customer">
          <p>Kitchen project</p>
        </DashboardShell>
      </MemoryRouter>,
    );
    expect(await screen.findByRole("heading", { name: /please accept the current agreements/i })).toBeInTheDocument();
    expect(screen.getByText("Kitchen project")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /terms of use/i })).toHaveAttribute("href", "/terms");
  });

  it("keeps the admin queue visible and prompts only when the setting is on", async () => {
    gate.pagesOn = true;
    renderRole(
      "ADMIN",
      <MemoryRouter initialEntries={["/app/admin"]}>
        <AdminLayout pendingApprovals={2}>
          <p>Approval queue</p>
        </AdminLayout>
      </MemoryRouter>,
    );
    expect(screen.getByText("Approval queue")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /open admin menu/i })).toHaveClass("md:hidden");
    await waitFor(() => expect(gate.fetchLegalAcceptanceRequired).toHaveBeenCalled());
    expect(screen.queryByRole("heading", { name: /please accept the current agreements/i })).not.toBeInTheDocument();

    gate.fetchLegalAcceptanceRequired.mockResolvedValue(true);
    gate.fetchMissingAgreements.mockResolvedValue([
      { slug: "privacy-policy", title: "Privacy Policy", version: 2, path: "/privacy", audience: "ALL" },
    ]);
    renderRole(
      "ADMIN",
      <MemoryRouter initialEntries={["/app/admin"]}>
        <AdminLayout pendingApprovals={2}>
          <p>Approval queue stays</p>
        </AdminLayout>
      </MemoryRouter>,
    );
    expect(await screen.findByRole("heading", { name: /please accept the current agreements/i })).toBeInTheDocument();
    expect(screen.getByText("Approval queue stays")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /privacy policy/i })).toHaveAttribute("href", "/privacy");
  });
});
