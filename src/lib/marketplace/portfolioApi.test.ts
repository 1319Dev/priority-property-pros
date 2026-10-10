import { beforeEach, describe, expect, it, vi } from "vitest";

const { state } = vi.hoisted(() => ({
  state: {
    from: vi.fn(),
  },
}));

vi.mock("../supabase/client", () => ({
  getSupabaseClient: () => ({ from: state.from }),
}));

import { addPortfolioItem, updatePortfolioItem } from "./api";

describe("portfolio writes", () => {
  const insert = vi.fn().mockResolvedValue({ error: null });
  const eq = vi.fn().mockResolvedValue({ error: null });
  const update = vi.fn().mockReturnValue({ eq });

  beforeEach(() => {
    insert.mockClear();
    update.mockClear();
    eq.mockClear();
    state.from.mockReset();
    state.from.mockImplementation((table: string) => {
      if (table !== "contractor_portfolio") throw new Error(`unexpected table ${table}`);
      return { insert, update };
    });
  });

  it("does not send privacy_state when adding a photo", async () => {
    await addPortfolioItem({
      contractor_profile_id: "cp-1",
      title: "Portfolio photo",
      storage_path: "user/portfolio/cedar.jpg",
      privacy_state: "PUBLIC_SAFE",
    });
    expect(insert).toHaveBeenCalledTimes(1);
    const payload = insert.mock.calls[0][0] as Record<string, unknown>;
    expect(payload).toEqual({
      contractor_profile_id: "cp-1",
      title: "Portfolio photo",
      storage_path: "user/portfolio/cedar.jpg",
    });
    expect(payload).not.toHaveProperty("privacy_state");
  });

  it("updates the caption without sending privacy_state", async () => {
    await updatePortfolioItem("photo-1", { title: "Fresh cedar caption" });
    expect(update).toHaveBeenCalledWith({ title: "Fresh cedar caption" });
    expect(eq).toHaveBeenCalledWith("id", "photo-1");
    expect(JSON.stringify(update.mock.calls[0][0])).not.toMatch(/privacy_state/);
  });
});
