import { beforeEach, describe, expect, it, vi } from "vitest";
import { getSupabaseClient } from "../supabase/client";
import {
  listSupportQueue,
  parseSupportConversation,
  replySupport,
  saveSupportArticle,
} from "./supportApi";

const state = { rpc: vi.fn() };

vi.mock("../supabase/client", () => ({
  getSupabaseClient: () => ({ rpc: state.rpc }),
}));

describe("support admin API", () => {
  beforeEach(() => {
    state.rpc.mockReset();
    expect(getSupabaseClient()).toBeTruthy();
  });

  it("parses a queue and keeps internal notes on the admin conversation", async () => {
    state.rpc.mockResolvedValueOnce({
      data: {
        queue: "open",
        availability: "offline",
        rows: [
          {
            id: "conv-1",
            reference: "PH-10001",
            status: "OPEN",
            priority: "HIGH",
            guest: false,
            role: "CUSTOMER",
            display_name: "Ada Lovelace",
          },
        ],
      },
      error: null,
    });
    const page = await listSupportQueue("open");
    expect(page.rows[0]?.reference).toBe("PH-10001");
    expect(page.availability).toBe("offline");

    const conversation = parseSupportConversation({
      id: "conv-1",
      reference: "PH-10001",
      status: "OPEN",
      priority: "HIGH",
      human_joined: false,
      messages: [
        { id: "pub", role: "customer", visibility: "public", body: "Please look at my registration." },
        { id: "note", role: "admin", visibility: "internal", body: "Asked billing to check the receipt." },
      ],
      account: {
        role: "CUSTOMER",
        first_name: "Ada",
        email: "ada@example.com",
        profile_href: null,
        business_name: null,
      },
    });
    expect(conversation.humanJoined).toBe(false);
    expect(conversation.messages.map((message) => message.visibility)).toEqual(["public", "internal"]);
  });

  it("rejects HTML before a reply or article is saved", async () => {
    await expect(replySupport("conv-1", "Hello <b>there</b>")).rejects.toThrow(/HTML is not allowed/);
    await expect(
      saveSupportArticle({ id: null, title: "Fees", slug: "fees", status: "DRAFT", body: "<script>alert(1)</script>" }),
    ).rejects.toThrow(/HTML is not allowed/);
    expect(state.rpc).not.toHaveBeenCalled();
  });

  it("maps an admin authorization failure without the raw database text", async () => {
    state.rpc.mockResolvedValueOnce({ data: null, error: { code: "42501", message: "permission denied for function admin_support_list" } });
    await expect(listSupportQueue("open")).rejects.toThrow(/admin sign-in/);
  });
});
