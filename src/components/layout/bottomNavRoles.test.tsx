import { render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it } from "vitest";
import { authValue, profileFor, signedInAuth } from "../../lib/auth/authFixture";
import { AuthContext, type AuthContextValue } from "../../lib/auth/AuthContext";
import { BottomNav } from "./BottomNav";

function navItems(value: AuthContextValue) {
  render(
    <AuthContext.Provider value={value}>
      <MemoryRouter initialEntries={["/"]}>
        <BottomNav />
      </MemoryRouter>
    </AuthContext.Provider>,
  );
  const nav = screen.getByRole("navigation", { name: "App" });
  return within(nav)
    .getAllByRole("link")
    .map((link) => [link.textContent?.trim(), link.getAttribute("href")]);
}

describe("phone bottom nav by role", () => {
  it("gives contractors Home, Jobs, Messages, Billing, Dashboard with one Dashboard", () => {
    const items = navItems(signedInAuth("CONTRACTOR"));
    expect(items).toEqual([
      ["Home", "/"],
      ["Jobs", "/app/pro/opportunities"],
      ["Messages", "/app/pro/messages"],
      ["Billing", "/app/pro/billing"],
      ["Dashboard", "/app/pro"],
    ]);
    expect(items.filter(([label]) => label === "Dashboard")).toHaveLength(1);
  });

  it("sends an unpaid contractor's Dashboard to activation", () => {
    const items = navItems(
      signedInAuth("CONTRACTOR", {
        profile: { ...profileFor("CONTRACTOR", "PENDING"), signup_fee_status: "UNPAID" },
        account_status: "PENDING",
        signup_fee_status: "UNPAID",
        signup_fee_enabled: true,
      }),
    );
    expect(items.map(([label]) => label)).toEqual(["Home", "Jobs", "Messages", "Billing", "Dashboard"]);
    expect(items[4][1]).toBe("/account/activate");
  });

  it("keeps the homeowner nav unchanged", () => {
    expect(navItems(signedInAuth("CUSTOMER"))).toEqual([
      ["Home", "/"],
      ["Find", "/find-a-pro"],
      ["Post", "/app/customer/projects/new/wizard"],
      ["Pros", "/become-a-pro"],
      ["Dashboard", "/app/customer"],
    ]);
  });

  it("keeps the signed-out nav unchanged", () => {
    expect(navItems(authValue())).toEqual([
      ["Home", "/"],
      ["Find", "/find-a-pro"],
      ["Post", "/post-project"],
      ["Pros", "/become-a-pro"],
      ["Sign in", "/sign-in"],
    ]);
  });
});
