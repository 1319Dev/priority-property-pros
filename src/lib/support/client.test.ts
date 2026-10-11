import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  GUEST_TOKEN_STORAGE_KEY,
  SUPPORT_HANDOFF,
  callPriorityHelp,
  containsSupportHtml,
  helpErrorMessage,
  normalizeHelpPayload,
  safeSupportText,
} from "./client";

const token = "guest-token-one-should-stay-local";

describe("priority help client", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("hashes nothing on the client and stores only the issued guest token", async () => {
    const invoke = vi.fn(async (body: Record<string, unknown>) => {
      expect(body.guestToken).toBeUndefined();
      expect(JSON.stringify(body)).not.toMatch(/service_role|SUPABASE_SERVICE_ROLE/);
      return {
        data: {
          ok: true,
          mode: "ai",
          availability: "offline",
          humanJoined: false,
          guestToken: token,
          conversation: { id: "c1", messages: [] },
        },
        error: null,
      };
    });

    const result = await callPriorityHelp({ action: "availability", signedIn: false }, invoke);
    expect(result.guestToken).toBe(token);
    expect(localStorage.getItem(GUEST_TOKEN_STORAGE_KEY)).toBe(token);

    await callPriorityHelp({ action: "history", signedIn: false }, invoke);
    expect(invoke).toHaveBeenNthCalledWith(2, expect.objectContaining({ action: "history", guestToken: token, company_website: "" }));
  });

  it("omits the guest token for a signed-in user", async () => {
    localStorage.setItem(GUEST_TOKEN_STORAGE_KEY, token);
    const invoke = vi.fn(async (body: Record<string, unknown>) => {
      expect(body).not.toHaveProperty("guestToken");
      return { data: { ok: true, mode: "ai", availability: "available" }, error: null };
    });
    await callPriorityHelp({ action: "history", signedIn: true }, invoke);
    expect(invoke).toHaveBeenCalledOnce();
  });

  it("drops internal notes and scrubs leaked contact details from staff text", () => {
    const result = normalizeHelpPayload(
      {
        ok: true,
        mode: "ai",
        availability: "available",
        humanJoined: false,
        conversation: {
          reference: "PH-10001",
          human_joined: false,
          messages: [
            { id: "1", role: "customer", body: "My email is ada@example.com", visibility: "public" },
            { id: "2", role: "assistant", body: "Write hidden@secret.com or call 404-555-0199.", visibility: "public" },
            { id: "3", role: "admin", body: "Internal: call the customer.", visibility: "internal" },
          ],
        },
      },
      null,
    );
    expect(result.reference).toBe("PH-10001");
    expect(result.messages.map((message) => message.body)).toEqual(["My email is ada@example.com", SUPPORT_HANDOFF]);
    expect(safeSupportText("assistant", "The legacy contractor_fee is 7%.")).toBe(SUPPORT_HANDOFF);
    expect(safeSupportText("assistant", "Activation is $9.99 and Connect is $4.99. There is no commission.")).toMatch(/\$9\.99/);
  });

  it("does not claim a human joined unless the payload says so", () => {
    const waiting = normalizeHelpPayload(
      { ok: true, mode: "human_only", availability: "offline", humanJoined: false, conversation: { human_joined: false } },
      null,
    );
    expect(waiting.humanJoined).toBe(false);
    expect(waiting.availability).toBe("offline");
    expect(waiting.mode).toBe("human_only");
  });

  it("maps server errors without throwing when the function is missing", async () => {
    const invoke = vi.fn(async () => ({ data: null, error: { message: "support is unavailable" } }));
    const result = await callPriorityHelp({ action: "send", body: "Hello", signedIn: false }, invoke);
    expect(result.ok).toBe(false);
    expect(result.mode).toBe("human_only");
    expect(helpErrorMessage(result.error)).toMatch(/can't reach the server/);
    expect(containsSupportHtml("Hello <b>there</b>")).toBe(true);
    expect(containsSupportHtml("Estimates are plain text")).toBe(false);
  });
});
