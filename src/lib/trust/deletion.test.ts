import { describe, expect, it } from "vitest";
import {
  DELETE_CONFIRM_PHRASE,
  alreadyClosedAccount,
  anonymizedContractorFields,
  anonymizedProfileFields,
  deletedAccountCannotStartWork,
  deletedAccountRemovedFromDirectory,
  deletionConfirmError,
  deletionPreservesLegalHistory,
  nextDeletionStatus,
  reauthRequiredForDeletion,
} from "./deletion";
import { canAppearInPublicDirectory, canStartNewMarketplaceWork } from "./restrictions";

describe("account deletion lifecycle", () => {
  it("requires an explicit DELETE confirmation and re-auth", () => {
    expect(deletionConfirmError("delete")).toMatch(/DELETE/);
    expect(deletionConfirmError(DELETE_CONFIRM_PHRASE)).toBeNull();
    expect(reauthRequiredForDeletion()).toBe(true);
  });

  it("moves through DELETION_REQUESTED then DELETED_ANONYMIZED", () => {
    expect(nextDeletionStatus("ACTIVE")).toBe("DELETION_REQUESTED");
    expect(nextDeletionStatus("DELETION_REQUESTED")).toBe("DELETED_ANONYMIZED");
    expect(alreadyClosedAccount("DELETED_ANONYMIZED")).toBe(true);
  });

  it("removes the account from the directory and new work without inventing history wipes", () => {
    expect(deletedAccountRemovedFromDirectory("DELETED_ANONYMIZED")).toBe(true);
    expect(deletedAccountCannotStartWork("DELETED_ANONYMIZED")).toBe(true);
    expect(canAppearInPublicDirectory({ approvalStatus: "APPROVED", accountStatus: "DELETED_ANONYMIZED" })).toBe(false);
    expect(canStartNewMarketplaceWork("DELETED_ANONYMIZED")).toBe(false);
    expect(deletionPreservesLegalHistory()).toBe(true);
    expect(anonymizedProfileFields("abc").first_name).toBe("Deleted");
    expect(anonymizedContractorFields().accepting_work).toBe(false);
  });
});
