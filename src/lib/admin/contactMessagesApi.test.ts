import { beforeEach, describe, expect, it, vi } from "vitest";
import { getSupabaseClient } from "../supabase/client";
import {
  fetchUnhandledContactCount,
  listContactMessages,
  markContactMessageHandled,
  parseContactMessage,
} from "./contactMessagesApi";

vi.mock("../supabase/client", () => ({
  getSupabaseClient: vi.fn(),
}));

const row = {
  id: "msg-1",
  created_at: "2026-10-10T15:04:00.000Z",
  name: "Ada Lovelace",
  email: "ada@example.com",
  phone: "936-555-0100",
  topic: "marketplace",
  message: "How do connection fees work?",
  email_status: "sent",
  handled_at: null,
  ip_hash: "should-not-be-required",
};

describe("contact message admin API", () => {
  const from = vi.fn();
  const rpc = vi.fn();

  beforeEach(() => {
    from.mockReset();
    rpc.mockReset();
    vi.mocked(getSupabaseClient).mockReset();
    vi.mocked(getSupabaseClient).mockReturnValue({ from, rpc } as never);
  });

  it("lists newest rows without selecting the IP hash", async () => {
    const select = vi.fn().mockReturnValue({
      order: vi.fn().mockReturnValue({
        limit: vi.fn().mockResolvedValue({ data: [row], error: null }),
      }),
    });
    from.mockReturnValue({ select });
    const messages = await listContactMessages();
    expect(from).toHaveBeenCalledWith("contact_messages");
    expect(select).toHaveBeenCalledWith(expect.not.stringContaining("ip_hash"));
    expect(messages[0]).toMatchObject({ id: "msg-1", emailStatus: "sent", handledAt: null });
  });

  it("drops a row that is missing the message", () => {
    expect(parseContactMessage({ ...row, message: "  " })).toBeNull();
  });

  it("maps a non-admin refusal and does not return the stored message", async () => {
    rpc.mockResolvedValue({ data: null, error: { code: "42501", message: `not authorized ${row.message}` } });
    await expect(markContactMessageHandled("msg-1")).rejects.toThrow(/admin sign-in/i);
    await expect(markContactMessageHandled("msg-1")).rejects.not.toThrow(/connection fees/i);
    expect(rpc).toHaveBeenCalledWith("admin_mark_contact_message_handled", { p_id: "msg-1" });
  });

  it("reads the unhandled count and treats a missing client as zero", async () => {
    rpc.mockResolvedValue({ data: 3, error: null });
    await expect(fetchUnhandledContactCount()).resolves.toBe(3);
    vi.mocked(getSupabaseClient).mockReturnValue(null);
    await expect(fetchUnhandledContactCount()).resolves.toBe(0);
  });
});
