import { render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import { describe, expect, it } from "vitest";
import { AuthContext, type AuthContextValue } from "../lib/auth/AuthContext";
import { authValue, profileFor } from "../lib/auth/authFixture";
import type { AccountType } from "../lib/auth/types";
import { AppNotificationsRedirect, LoginRedirect } from "./RouteRedirects";

function Where() {
  const location = useLocation();
  const from = (location.state as { from?: string } | null)?.from ?? "";
  return <p data-testid="where">{`${location.pathname}${location.search}|from=${from}`}</p>;
}

function renderAt(entry: string, value: AuthContextValue) {
  return render(
    <AuthContext.Provider value={value}>
      <MemoryRouter initialEntries={[entry]}>
        <Routes>
          <Route path="/login" element={<LoginRedirect />} />
          <Route path="/app/notifications" element={<AppNotificationsRedirect />} />
          <Route path="*" element={<Where />} />
        </Routes>
      </MemoryRouter>
    </AuthContext.Provider>,
  );
}

function signedIn(type: AccountType): AuthContextValue {
  return authValue({
    user: { id: "user-1", email: "pat@example.com" } as AuthContextValue["user"],
    profile: profileFor(type),
    account_type: type,
    account_status: "ACTIVE",
  });
}

describe("route redirects", () => {
  it("sends /login to /sign-in and keeps the query", () => {
    renderAt("/login?next=1", authValue());
    expect(screen.getByTestId("where")).toHaveTextContent("/sign-in?next=1|from=");
  });

  it.each([
    ["CUSTOMER", "/app/customer/notifications"],
    ["CONTRACTOR", "/app/pro/notifications"],
    ["ADMIN", "/app/admin/notifications"],
    ["VERIFIER", "/app/verifier/account/notifications"],
  ] as const)("sends a signed-in %s from /app/notifications to %s", (type, path) => {
    renderAt("/app/notifications", signedIn(type));
    expect(screen.getByTestId("where")).toHaveTextContent(`${path}|from=`);
  });

  it("asks a signed-out visitor to sign in and comes back to notifications", () => {
    renderAt("/app/notifications", authValue());
    expect(screen.getByTestId("where")).toHaveTextContent("/sign-in|from=/app/notifications");
  });
});
