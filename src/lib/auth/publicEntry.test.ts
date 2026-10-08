import { describe, expect, it } from "vitest";
import { authAwarePostPath, dashboardPath, showContractorSignup, showCustomerSignup } from "./publicEntry";

describe("public signed-in entry", () => {
  it("sends a signed-in customer straight to the wizard and keeps the query", () => {
    expect(
      authAwarePostPath("/post-project?pro=abc&trade=Fence+Repair", {
        loading: false,
        accountType: "CUSTOMER",
      }),
    ).toBe("/app/customer/projects/new/wizard?pro=abc&trade=Fence+Repair");
  });

  it("keeps the public post page while auth is loading or the viewer is not a customer", () => {
    expect(authAwarePostPath("/post-project", { loading: true, accountType: "CUSTOMER" })).toBe("/post-project");
    expect(authAwarePostPath("/post-project", { loading: false, accountType: null })).toBe("/post-project");
    expect(authAwarePostPath("/post-project", { loading: false, accountType: "CONTRACTOR" })).toBe("/post-project");
  });

  it("hides pro signup for contractors and customer signup for people who already have an account", () => {
    expect(showContractorSignup({ loading: false, accountType: null })).toBe(true);
    expect(showContractorSignup({ loading: false, accountType: "CUSTOMER" })).toBe(true);
    expect(showContractorSignup({ loading: false, accountType: "CONTRACTOR" })).toBe(false);
    expect(showContractorSignup({ loading: true, accountType: null })).toBe(false);
    expect(showCustomerSignup({ loading: false, accountType: null })).toBe(true);
    expect(showCustomerSignup({ loading: false, accountType: "CUSTOMER", signedIn: true })).toBe(false);
    expect(showCustomerSignup({ loading: false, accountType: "CONTRACTOR", signedIn: true })).toBe(false);
    expect(showCustomerSignup({ loading: true, accountType: null })).toBe(false);
  });

  it("opens the role home", () => {
    expect(dashboardPath({ accountType: "CUSTOMER", accountStatus: "ACTIVE" })).toBe("/app/customer");
    expect(dashboardPath({ accountType: "CONTRACTOR", accountStatus: "ACTIVE" })).toBe("/app/pro");
    expect(dashboardPath({ accountType: "ADMIN", accountStatus: "ACTIVE" })).toBe("/app/admin");
  });
});
