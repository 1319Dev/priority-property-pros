import { describe, expect, it } from "vitest";
import {
  addProtectionMonths,
  clientCannotForgeRelationship,
  clientCannotSelfMarkRepeat,
  isHireAgainEligible,
  protectedPeriodActive,
  relationshipCreatedOn,
  repeatPricingEligible,
} from "./relationships";

describe("relationships and Hire Again", () => {
  it("creates a relationship only when a booking becomes CONFIRMED", () => {
    expect(relationshipCreatedOn("PENDING")).toBe(false);
    expect(relationshipCreatedOn("AWAITING_PAYMENT")).toBe(false);
    expect(relationshipCreatedOn("CANCELLED")).toBe(false);
    expect(relationshipCreatedOn("CONFIRMED")).toBe(true);
  });

  it("requires a completed booking for Hire Again, independent of the protected window", () => {
    const row = {
      customer_id: "c1",
      contractor_profile_id: "p1",
      last_completed_booking_id: "b1",
      status: "ACTIVE" as const,
      protected_until: "2000-01-01T00:00:00Z",
    };
    expect(isHireAgainEligible(row)).toBe(true);
    expect(protectedPeriodActive(row.protected_until)).toBe(false);
    expect(repeatPricingEligible(true)).toBe(true);
    expect(repeatPricingEligible(false)).toBe(false);
    expect(isHireAgainEligible({ ...row, last_completed_booking_id: null })).toBe(false);
    expect(isHireAgainEligible({ ...row, status: "BLOCKED" })).toBe(false);
  });

  it("renews protection using server-configurable months, not a hardcoded frontend 12", () => {
    const start = new Date("2026-01-15T00:00:00Z");
    expect(addProtectionMonths(start, 12).toISOString()).toBe("2027-01-15T00:00:00.000Z");
    expect(addProtectionMonths(start, 6).toISOString()).toBe("2026-07-15T00:00:00.000Z");
    expect(clientCannotForgeRelationship()).toBe(true);
    expect(clientCannotSelfMarkRepeat()).toBe(true);
  });
});
