import { beforeEach, describe, expect, it, vi } from "vitest";
import { getSupabaseClient } from "../supabase/client";
import { confirmBookingForTesting, cancelPendingBooking } from "../marketplace/api";
import { adminListPlatformReviews } from "../marketplace/platformReviewsApi";

vi.mock("../supabase/client", () => ({
  getSupabaseClient: vi.fn(),
}));

describe("admin error mapping", () => {
  beforeEach(() => {
    vi.mocked(getSupabaseClient).mockReset();
  });

  it("hides raw database text on admin calls and leaves customer calls alone", async () => {
    const rpc = vi.fn().mockResolvedValue({
      data: null,
      error: { code: "42501", message: "permission denied for table signup_fee_charges" },
    });
    vi.mocked(getSupabaseClient).mockReturnValue({ rpc, from: vi.fn() } as never);

    await expect(confirmBookingForTesting("booking-1")).rejects.toThrow("You need an admin sign-in to do that.");
    await expect(cancelPendingBooking("booking-1")).rejects.toThrow("Could not cancel the booking.");
    await expect(cancelPendingBooking("booking-1")).rejects.not.toThrow(/signup_fee_charges/);
  });

  it("maps admin review reads without changing the public review error helper", async () => {
    const from = vi.fn().mockReturnValue({
      select: () => ({
        order: () => Promise.resolve({ data: null, error: { message: 'relation "secret" does not exist' } }),
      }),
    });
    vi.mocked(getSupabaseClient).mockReturnValue({ from } as never);
    await expect(adminListPlatformReviews()).rejects.toThrow("Could not load platform reviews.");
  });
});
