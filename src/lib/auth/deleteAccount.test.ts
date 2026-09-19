import { describe, expect, it } from "vitest";
import { DELETE_ACCOUNT_CONFIRM_WORD, deleteAccountConfirmEnabled } from "./deleteAccount";

describe("delete account confirmation", () => {
  it("requires the exact DELETE word", () => {
    expect(DELETE_ACCOUNT_CONFIRM_WORD).toBe("DELETE");
    expect(deleteAccountConfirmEnabled("")).toBe(false);
    expect(deleteAccountConfirmEnabled("delete")).toBe(false);
    expect(deleteAccountConfirmEnabled("DELETE ")).toBe(true);
    expect(deleteAccountConfirmEnabled("DELETE")).toBe(true);
    expect(deleteAccountConfirmEnabled("DELETED")).toBe(false);
  });
});
