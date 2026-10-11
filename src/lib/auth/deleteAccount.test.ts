import { describe, expect, it } from "vitest";
import {
  DELETE_ACCOUNT_ACTIVE_JOBS_ERROR,
  DELETE_ACCOUNT_DELETED_STATUS,
  DELETE_ACCOUNT_DISPUTE_ERROR,
  DELETE_ACCOUNT_GENERIC_ERROR,
  DELETE_ACCOUNT_INCOMPLETE_ERROR,
  DELETE_ACCOUNT_PASSWORD_ERROR,
  DELETE_ACCOUNT_REFUND_ERROR,
  deleteAccountConfirmEnabled,
  friendlyDeleteAccountError,
} from "./deleteAccount";

describe("delete account confirmation", () => {
  it("requires the exact DELETE word and a password", () => {
    expect(deleteAccountConfirmEnabled("", "secret")).toBe(false);
    expect(deleteAccountConfirmEnabled("delete", "secret")).toBe(false);
    expect(deleteAccountConfirmEnabled("DELETE", "")).toBe(false);
    expect(deleteAccountConfirmEnabled("DELETE", "   ")).toBe(false);
    expect(deleteAccountConfirmEnabled("DELETE ", "secret")).toBe(true);
    expect(deleteAccountConfirmEnabled("DELETE", "secret")).toBe(true);
    expect(deleteAccountConfirmEnabled("DELETED", "secret")).toBe(false);
  });

  it("hides raw database errors and names the block", () => {
    expect(friendlyDeleteAccountError("project connections cannot be written from the client")).toBe(
      DELETE_ACCOUNT_GENERIC_ERROR,
    );
    expect(
      friendlyDeleteAccountError(
        '{"code":"P0001","message":"Finish or cancel your active jobs before deleting this account."}',
      ),
    ).toBe(DELETE_ACCOUNT_ACTIVE_JOBS_ERROR);
    expect(friendlyDeleteAccountError("Resolve the open dispute before deleting this account.")).toBe(
      DELETE_ACCOUNT_DISPUTE_ERROR,
    );
    expect(
      friendlyDeleteAccountError("Wait until the outstanding refund is finished before deleting this account."),
    ).toBe(DELETE_ACCOUNT_REFUND_ERROR);
    expect(friendlyDeleteAccountError("Enter your current password to delete this account.")).toBe(
      DELETE_ACCOUNT_PASSWORD_ERROR,
    );
    expect(friendlyDeleteAccountError("cannot delete the last active admin")).toMatch(/last admin/);
    expect(friendlyDeleteAccountError("not signed in")).toMatch(/Sign in again/);
    expect(friendlyDeleteAccountError("could not close the auth user")).toBe(DELETE_ACCOUNT_INCOMPLETE_ERROR);
    expect(DELETE_ACCOUNT_INCOMPLETE_ERROR).toMatch(/Nothing was changed/);
    expect(DELETE_ACCOUNT_GENERIC_ERROR).toMatch(/Nothing was changed/);
    expect(DELETE_ACCOUNT_DELETED_STATUS).toMatch(/Payment, refund, and dispute records stay/);
  });
});
