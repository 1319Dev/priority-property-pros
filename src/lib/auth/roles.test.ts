import { describe, expect, it } from "vitest";
import { postLoginPath, sanitizeSignupAccountType } from "./roles";
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

  it("lets suspended accounts sign in so they can appeal", () => {
    expect(postLoginPath("CUSTOMER", "SUSPENDED")).toBe("/app/customer");
    expect(postLoginPath("ADMIN", "DISABLED")).toBe("/account/status");
    expect(postLoginPath("CUSTOMER", "DELETED_ANONYMIZED")).toBe("/account/status");
  });
});
