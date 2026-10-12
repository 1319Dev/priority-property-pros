import { beforeEach, describe, expect, it, vi } from "vitest";

const { state } = vi.hoisted(() => ({
  state: {
    upload: vi.fn(),
    insert: vi.fn(),
    strip: vi.fn(),
  },
}));

vi.mock("../supabase/client", () => ({
  getSupabaseClient: () => ({
    storage: { from: () => ({ upload: state.upload, remove: vi.fn() }) },
    from: () => ({ insert: state.insert }),
  }),
}));

vi.mock("../media/stripImageMetadata", () => ({ stripImageMetadata: state.strip }));

import { uploadContractorDoc, uploadProjectPhoto } from "./api";

describe("photo uploads strip metadata before storage", () => {
  const cleaned = new File([new Uint8Array([1, 2, 3])], "IMG_9.jpg", { type: "image/jpeg" });

  beforeEach(() => {
    state.upload.mockReset().mockResolvedValue({ error: null });
    state.insert.mockReset().mockResolvedValue({ error: null });
    state.strip.mockReset().mockResolvedValue(cleaned);
  });

  it("uploads the cleaned project photo, never the original", async () => {
    const original = new File([new Uint8Array([9, 9])], "IMG_9.HEIC", { type: "image/heic" });
    const path = await uploadProjectPhoto({ userId: "u1", projectId: "p1", file: original, sortOrder: 0 });
    expect(state.strip).toHaveBeenCalledWith(original);
    expect(state.upload).toHaveBeenCalledTimes(1);
    expect(state.upload.mock.calls[0][1]).toBe(cleaned);
    expect(state.upload.mock.calls[0][2]).toMatchObject({ contentType: "image/jpeg" });
    expect(path).toMatch(/^u1\/p1\/.+-IMG_9\.jpg$/);
  });

  it("uploads the cleaned portfolio photo", async () => {
    const original = new File([new Uint8Array([9])], "deck.jpg", { type: "image/jpeg" });
    await uploadContractorDoc({ userId: "u1", folder: "portfolio", file: original });
    expect(state.strip).toHaveBeenCalledWith(original);
    expect(state.upload.mock.calls[0][1]).toBe(cleaned);
  });

  it("does not upload anything when stripping fails", async () => {
    state.strip.mockRejectedValueOnce(new Error("We couldn't remove location data from this photo, so it was not uploaded."));
    const original = new File([new Uint8Array([9])], "deck.jpg", { type: "image/jpeg" });
    await expect(uploadProjectPhoto({ userId: "u1", projectId: "p1", file: original, sortOrder: 0 })).rejects.toThrow(
      /location data/,
    );
    expect(state.upload).not.toHaveBeenCalled();
  });
});
