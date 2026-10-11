import { describe, expect, it } from "vitest";
import {
  DELETE_ACCOUNT_ACTIVE_JOBS_ERROR,
  DELETE_ACCOUNT_CONFIRM_WORD,
  DELETE_ACCOUNT_GENERIC_ERROR,
  DELETE_ACCOUNT_INCOMPLETE_ERROR,
  deleteAccountConfirmEnabled,
  friendlyDeleteAccountError,
} from "./deleteAccount";

describe("delete account confirmation", () => {
  it("requires the exact DELETE word", () => {
    expect(DELETE_ACCOUNT_CONFIRM_WORD).toBe("DELETE");
    expect(deleteAccountConfirmEnabled("")).toBe(false);
    expect(deleteAccountConfirmEnabled("delete")).toBe(false);
    expect(deleteAccountConfirmEnabled("DELETE ")).toBe(true);
    expect(deleteAccountConfirmEnabled("DELETE")).toBe(true);
    expect(deleteAccountConfirmEnabled("DELETED")).toBe(false);
  });

  it("hides raw database errors and names an in-progress job", () => {
    expect(friendlyDeleteAccountError("project connections cannot be written from the client")).toBe(
      DELETE_ACCOUNT_GENERIC_ERROR,
    );
    expect(
      friendlyDeleteAccountError(
        '{"code":"P0001","message":"Finish or cancel your active jobs before deleting this account."}',
      ),
    ).toBe(DELETE_ACCOUNT_ACTIVE_JOBS_ERROR);
    expect(friendlyDeleteAccountError("cannot delete the last active admin")).toMatch(/last admin/);
    expect(friendlyDeleteAccountError("not signed in")).toMatch(/Sign in again/);
    expect(friendlyDeleteAccountError("could not close the auth user")).toBe(DELETE_ACCOUNT_GENERIC_ERROR);
    expect(DELETE_ACCOUNT_INCOMPLETE_ERROR).toMatch(/Nothing was charged/);
  });
});
