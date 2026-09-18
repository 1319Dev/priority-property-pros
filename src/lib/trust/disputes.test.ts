import { describe, expect, it } from "vitest";
import {
  anonymousCannotAccessDisputes,
  canAdminResolveDispute,
  canCreateDispute,
  canReadDispute,
  disputesAreImmutableAfterResolve,
  resolutionRemovesFromRating,
  resolutionReinstates,
  resolutionToStatus,
} from "./disputes";

const user = { id: "user-1", accountType: "CUSTOMER" as const, accountStatus: "ACTIVE" as const };
const admin = { id: "admin-1", accountType: "ADMIN" as const, accountStatus: "ACTIVE" as const };

describe("disputes and appeals", () => {
  it("lets a signed-in user file a review or suspension dispute", () => {
    expect(
      canCreateDispute(user, {
        category: "INACCURATE_REVIEW",
        explanation: "This review describes the wrong job.",
        disputedReviewId: "rev-1",
      }),
    ).toBeNull();
    expect(
      canCreateDispute({ ...user, accountStatus: "SUSPENDED" }, {
        category: "RATING_SUSPENSION",
        explanation: "Please review the automatic suspension.",
      }),
    ).toBeNull();
  });

  it("requires a review id for review disputes and hides disputes from anonymous users", () => {
    expect(
      canCreateDispute(user, { category: "FRAUDULENT_REVIEW", explanation: "This review is fake." }),
    ).toMatch(/review/i);
    expect(canReadDispute({ id: null, accountType: null, accountStatus: null }, "user-1")).toBe(false);
    expect(anonymousCannotAccessDisputes()).toBe(true);
    expect(canReadDispute(user, "someone-else")).toBe(false);
    expect(canReadDispute(admin, "user-1")).toBe(true);
  });

  it("blocks self-approval and maps admin resolutions", () => {
    expect(canAdminResolveDispute(admin, "admin-1")).toMatch(/own dispute/i);
    expect(canAdminResolveDispute(admin, "user-1", "admin-1")).toMatch(/unsuspend yourself/i);
    expect(canAdminResolveDispute(user, "user-2")).toMatch(/admin/i);
    expect(canAdminResolveDispute(admin, "user-1")).toBeNull();
    expect(resolutionToStatus("UPHOLD")).toBe("RESOLVED_UPHELD");
    expect(resolutionToStatus("REMOVE_FROM_RATING")).toBe("RESOLVED_REMOVED");
    expect(resolutionToStatus("REINSTATE")).toBe("RESOLVED_ADJUSTED");
    expect(resolutionRemovesFromRating("REMOVE_FROM_RATING")).toBe(true);
    expect(resolutionReinstates("REINSTATE")).toBe(true);
    expect(disputesAreImmutableAfterResolve("RESOLVED_UPHELD")).toBe(true);
  });
});
