import { describe, expect, it } from "vitest";
import {
  IDOR_MATRIX,
  anonCannotReadDisputes,
  arbitraryUuidReviewBlocked,
  restrictedCannotStartWorkViaRpc,
  strangerCannotReviewJob,
  userCannotAlterOthersReview,
} from "./idor";
import { canAdminResolveDispute } from "./disputes";
import { cannotSelfUnsuspend } from "./restrictions";

describe("trust IDOR matrix", () => {
  it("covers the required authorization cases", () => {
    expect(IDOR_MATRIX.length).toBeGreaterThanOrEqual(8);
    expect(anonCannotReadDisputes({ id: null, accountType: null, accountStatus: null }, "user-1")).toBe(true);
    expect(userCannotAlterOthersReview("user-1", "user-2")).toBe(true);
    expect(cannotSelfUnsuspend()).toBe(true);
    expect(
      canAdminResolveDispute({ id: "admin-1", accountType: "ADMIN", accountStatus: "ACTIVE" }, "admin-1"),
    ).toMatch(/own dispute/i);
    expect(restrictedCannotStartWorkViaRpc("SUSPENDED")).toBe(true);
    expect(restrictedCannotStartWorkViaRpc("DELETED_ANONYMIZED")).toBe(true);
    expect(
      strangerCannotReviewJob({
        actorId: "stranger",
        actorRole: "CUSTOMER",
        bookingStatus: "COMPLETED",
        bookingCustomerId: "cust-1",
        bookingContractorProfileId: "pro-1",
        contractorOwnerProfileId: "pro-user-1",
        existingSides: [],
      }),
    ).toBe(true);
    expect(arbitraryUuidReviewBlocked()).toBe(true);
  });
});
