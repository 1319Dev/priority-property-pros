import { describe, expect, it, vi } from "vitest";
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

describe("account deletion pause", () => {
  it("maps the server account_deletion_paused error to the support-email notice", async () => {
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
    expect(mod.ACCOUNT_DELETION_PAUSED).toBe(true);
    expect(mod.ACCOUNT_DELETION_REQUEST_MAILTO).toBe(
      "mailto:support@prioritypropertypros.com?subject=Account%20deletion%20request",
    );
    await expect(mod.deleteOwnAccount()).resolves.toEqual({
      error: mod.ACCOUNT_DELETION_PAUSED_MESSAGE,
    });
    expect(mod.ACCOUNT_DELETION_PAUSED_MESSAGE).toBe(
      "Account deletion is temporarily handled by our support team. To request deletion, email support@prioritypropertypros.com from the email on your account, and we will process it.",
    );
    vi.doUnmock("../supabase/client");
  });
});
