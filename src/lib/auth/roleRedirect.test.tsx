import { render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";
import { AuthContext, type AuthContextValue } from "./AuthContext";
import { RequireRole } from "./guards";
import { pathForRole, roleReturnPath } from "./roles";
import type { AccountType, Profile } from "./types";

vi.mock("./adminMfaApi", () => ({
  loadAdminMfaGate: vi.fn(),
  verifyAdminSignInCode: vi.fn(),
}));

describe("pathForRole", () => {
  it("maps another role's shared page to the signed-in role", () => {
    expect(pathForRole("/app/customer/account", "CONTRACTOR")).toBe("/app/pro/account");
    expect(pathForRole("/app/customer/account/notifications", "CONTRACTOR")).toBe("/app/pro/account/notifications");
    expect(pathForRole("/app/customer/notifications", "CONTRACTOR")).toBe("/app/pro/notifications");
    expect(pathForRole("/app/pro/account", "CUSTOMER")).toBe("/app/customer/account");
  });

  it("sends a role-only page to the signed-in dashboard", () => {
    expect(pathForRole("/app/customer/projects/abc", "CONTRACTOR")).toBe("/app/pro");
    expect(pathForRole("/app/customer/account/blocked", "CONTRACTOR")).toBe("/app/pro");
    expect(pathForRole("/app/pro/billing", "CUSTOMER")).toBe("/app/customer");
    expect(pathForRole("/app/customer/notifications", "ADMIN")).toBe("/app/admin");
  });

  it("keeps the role's own pages and public pages", () => {
    expect(pathForRole("/app/pro/jobs/b1", "CONTRACTOR")).toBe("/app/pro/jobs/b1");
    expect(pathForRole("/app/pro", "CONTRACTOR")).toBe("/app/pro");
    expect(pathForRole("/find-a-pro", "CONTRACTOR")).toBe("/find-a-pro");
  });
});

describe("roleReturnPath", () => {
  it("does not send a contractor to /app/customer/account after sign-in", () => {
    expect(roleReturnPath("/app/customer/account", "CONTRACTOR", "/app/pro")).toBe("/app/pro/account");
  });

  it("falls back for missing, external, and sign-in paths", () => {
    expect(roleReturnPath(undefined, "CONTRACTOR", "/app/pro")).toBe("/app/pro");
    expect(roleReturnPath("https://evil.example", "CONTRACTOR", "/app/pro")).toBe("/app/pro");
    expect(roleReturnPath("//evil.example", "CONTRACTOR", "/app/pro")).toBe("/app/pro");
    expect(roleReturnPath("/sign-in", "CONTRACTOR", "/app/pro")).toBe("/app/pro");
  });

  it("lets activation and blocked-status pages win over a saved path", () => {
    expect(roleReturnPath("/app/pro/jobs", "CONTRACTOR", "/account/activate")).toBe("/account/activate");
    expect(roleReturnPath("/app/pro/jobs", "CONTRACTOR", "/account/status")).toBe("/account/status");
  });
});

function profile(type: AccountType): Profile {
  return {
    id: "user-1",
    email: "pat@example.com",
    first_name: "Pat",
    last_name: "Lee",
    phone: null,
    avatar_url: null,
    account_type: type,
    account_status: "ACTIVE",
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-01T00:00:00Z",
  };
}

function Where() {
  const location = useLocation();
  return <p data-testid="where">{location.pathname}</p>;
}

describe("RequireRole", () => {
  it("puts a contractor on /app/pro/account, not /app/customer/account", () => {
    const value = {
      configured: true,
      loading: false,
      user: { id: "user-1" },
      session: null,
      profile: profile("CONTRACTOR"),
      account_type: "CONTRACTOR",
      account_status: "ACTIVE",
      signup_fee_status: "NOT_REQUIRED",
      signup_fee_enabled: true,
    } as unknown as AuthContextValue;
    render(
      <AuthContext.Provider value={value}>
        <MemoryRouter initialEntries={["/app/customer/account"]}>
          <Routes>
            <Route element={<RequireRole role="CUSTOMER" />}>
              <Route path="/app/customer/account" element={<p>customer account</p>} />
            </Route>
            <Route path="/app/pro/account" element={<Where />} />
          </Routes>
        </MemoryRouter>
      </AuthContext.Provider>,
    );
    expect(screen.getByTestId("where")).toHaveTextContent("/app/pro/account");
    expect(screen.queryByText("customer account")).not.toBeInTheDocument();
  });
});
