import { describe, expect, it } from "vitest";
import { hidePlatformPricing } from "./platformPricing";

const customer = {
  loading: false,
  signedIn: true,
  accountType: "CUSTOMER" as const,
};

describe("hidePlatformPricing", () => {
  it("hides platform pricing for an activated customer", () => {
    expect(hidePlatformPricing({ ...customer, signupFeeEnabled: true, signupFeeStatus: "PAID" })).toBe(true);
    expect(hidePlatformPricing({ ...customer, signupFeeEnabled: true, signupFeeStatus: "NOT_REQUIRED" })).toBe(true);
    expect(hidePlatformPricing({ ...customer, signupFeeEnabled: false, signupFeeStatus: "UNPAID" })).toBe(true);
  });

  it("keeps the activation step visible until the signup fee is satisfied", () => {
    expect(hidePlatformPricing({ ...customer, signupFeeEnabled: true, signupFeeStatus: "UNPAID" })).toBe(false);
    expect(hidePlatformPricing({ ...customer, signupFeeEnabled: true, signupFeeStatus: null })).toBe(false);
  });

  it("leaves pricing visible for visitors, contractors, and while auth is loading", () => {
    expect(
      hidePlatformPricing({
        loading: false,
        signedIn: false,
        accountType: null,
        signupFeeEnabled: true,
        signupFeeStatus: null,
      }),
    ).toBe(false);
    expect(
      hidePlatformPricing({
        loading: false,
        signedIn: true,
        accountType: "CONTRACTOR",
        signupFeeEnabled: true,
        signupFeeStatus: "PAID",
      }),
    ).toBe(false);
    expect(hidePlatformPricing({ ...customer, loading: true, signupFeeEnabled: true, signupFeeStatus: "PAID" })).toBe(
      false,
    );
  });
});
