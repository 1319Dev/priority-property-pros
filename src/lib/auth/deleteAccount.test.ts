import { describe, expect, it, vi } from "vitest";
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

describe("account deletion pause", () => {
  it("still maps a paused server (503 account_deletion_paused) to the support-email notice", async () => {
    vi.resetModules();
    const invoke = vi.fn().mockResolvedValue({
      data: null,
      error: {
        message: "Edge Function returned a non-2xx status code",
        context: new Response(
          JSON.stringify({ error: "account_deletion_paused", message: "paused" }),
          { status: 503, headers: { "Content-Type": "application/json" } },
        ),
      },
    });
    vi.doMock("../supabase/client", () => ({
      getSupabaseClient: () => ({ functions: { invoke } }),
    }));
    const mod = await import("./deleteAccount");
    expect(mod.ACCOUNT_DELETION_PAUSED).toBe(false);
    expect(mod.ACCOUNT_DELETION_REQUEST_MAILTO).toBe(
      "mailto:support@prioritypropertypros.com?subject=Account%20deletion%20request",
    );
    await expect(mod.deleteOwnAccount("secret")).resolves.toEqual({
      error: mod.ACCOUNT_DELETION_PAUSED_MESSAGE,
      deleted: false,
    });
    expect(mod.ACCOUNT_DELETION_PAUSED_MESSAGE).toBe(
      "Account deletion is temporarily handled by our support team. To request deletion, email support@prioritypropertypros.com from the email on your account, and we will process it.",
    );
    vi.doUnmock("../supabase/client");
  });
});
