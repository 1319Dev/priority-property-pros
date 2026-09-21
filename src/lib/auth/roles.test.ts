import { describe, expect, it } from "vitest";
import { accountInitials, accountSettingsPath, postLoginPath, sanitizeSignupAccountType } from "./roles";
import { buildSignupMetadata } from "./signupMetadata";

describe("signup metadata", () => {
  it("never sends ADMIN even if the client forges the account type", () => {
    const meta = buildSignupMetadata({
      email: "x@example.com",
      password: "password12",
      firstName: "Pat",
      lastName: "Lee",
      accountType: "ADMIN" as never,
      acceptedTerms: true,
    });
    expect(meta.account_type).toBe("CUSTOMER");
    expect(meta.account_type).not.toBe("ADMIN");
  });

  it("allows only public signup types", () => {
    expect(sanitizeSignupAccountType("CONTRACTOR")).toBe("CONTRACTOR");
    expect(sanitizeSignupAccountType("verifier")).toBe("VERIFIER");
    expect(sanitizeSignupAccountType("ADMIN")).toBe("CUSTOMER");
    expect(sanitizeSignupAccountType("superuser")).toBe("CUSTOMER");
  });
});

describe("post-login routing", () => {
  it("sends each role to its dashboard", () => {
    expect(postLoginPath("CUSTOMER", "ACTIVE")).toBe("/app/customer");
    expect(postLoginPath("CONTRACTOR", "PENDING")).toBe("/app/pro");
    expect(postLoginPath("VERIFIER", "PENDING")).toBe("/app/verifier");
    expect(postLoginPath("ADMIN", "ACTIVE")).toBe("/app/admin");
  });

  it("sends unpaid accounts to activate only when the signup fee is enabled", () => {
    expect(postLoginPath("CUSTOMER", "ACTIVE", { enabled: true, status: "UNPAID" })).toBe("/account/activate");
    expect(postLoginPath("CUSTOMER", "ACTIVE", { enabled: false, status: "UNPAID" })).toBe("/app/customer");
    expect(postLoginPath("CUSTOMER", "ACTIVE", { enabled: true, status: "PAID" })).toBe("/app/customer");
    expect(postLoginPath("VERIFIER", "PENDING", { enabled: true, status: "UNPAID" })).toBe("/app/verifier");
  });
});

describe("account settings path", () => {
  it("sends each role to its account page", () => {
    expect(accountSettingsPath("CUSTOMER", "ACTIVE")).toBe("/app/customer/account");
    expect(accountSettingsPath("CONTRACTOR", "PENDING")).toBe("/app/pro/account");
    expect(accountSettingsPath("VERIFIER", "PENDING")).toBe("/app/verifier/account");
    expect(accountSettingsPath("ADMIN", "ACTIVE")).toBe("/app/admin/account");
  });

  it("keeps blocked accounts on the status page", () => {
    expect(accountSettingsPath("CUSTOMER", "SUSPENDED")).toBe("/account/status");
  });
});

describe("account initials", () => {
  it("uses first and last name when present", () => {
    expect(accountInitials("Pat", "Lee", "pat@example.com")).toBe("PL");
  });

  it("falls back to the email", () => {
    expect(accountInitials("", "", "pat@example.com")).toBe("P");
  });
});
