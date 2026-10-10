import { beforeEach, describe, expect, it, vi } from "vitest";

const { state } = vi.hoisted(() => ({
  state: { rpc: vi.fn() },
}));

vi.mock("../supabase/client", () => ({
  getSupabaseClient: () => ({ rpc: state.rpc }),
}));

import { adminListPortfolioReviewQueue, adminSetPortfolioPrivacy } from "./approvalsApi";

const missing = {
  message: "Could not find the function public.admin_list_portfolio_review_queue in the schema cache",
};

describe("portfolio review RPCs", () => {
  beforeEach(() => {
    state.rpc.mockReset();
  });

  it("turns a missing list RPC into a friendly error", async () => {
    state.rpc.mockResolvedValue({ data: null, error: missing });
    await expect(adminListPortfolioReviewQueue()).rejects.toThrow("Could not load photos waiting for review.");
    expect(state.rpc).toHaveBeenCalledWith("admin_list_portfolio_review_queue");
  });

  it("turns a missing privacy RPC into a friendly error", async () => {
    state.rpc.mockResolvedValue({
      data: null,
      error: { message: "Could not find the function public.admin_set_portfolio_privacy in the schema cache" },
    });
    await expect(adminSetPortfolioPrivacy("photo-1", "PUBLIC_SAFE")).rejects.toThrow("Could not update this photo.");
    expect(state.rpc).toHaveBeenCalledWith("admin_set_portfolio_privacy", {
      p_item_id: "photo-1",
      p_state: "PUBLIC_SAFE",
      p_note: null,
    });
  });
});
