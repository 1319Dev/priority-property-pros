import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { AdminReviewsPage } from "./AdminReviewsPage";

const adminListPlatformReviews = vi.fn();
const adminSetPlatformReviewStatus = vi.fn();

vi.mock("../../../lib/marketplace/platformReviewsApi", () => ({
  adminListPlatformReviews: (...args: unknown[]) => adminListPlatformReviews(...args),
  adminSetPlatformReviewStatus: (...args: unknown[]) => adminSetPlatformReviewStatus(...args),
}));

vi.mock("../../../lib/supabase/config", () => ({
  isSupabaseConfigured: () => true,
}));

const pending = {
  id: "review-2",
  user_id: "user-2",
  display_name: "Jordan M.",
  city: "Decatur",
  rating: 4,
  body: "The marketplace was easy to follow from posting to hiring.",
  status: "PENDING" as const,
  created_at: "2026-10-08T15:00:00.000Z",
};

describe("platform review moderation", () => {
  beforeEach(() => {
    adminListPlatformReviews.mockReset();
    adminSetPlatformReviewStatus.mockReset();
    adminListPlatformReviews.mockResolvedValue([pending]);
    adminSetPlatformReviewStatus.mockResolvedValue(undefined);
  });

  it("requires a reason before approve or reject and sends that reason", async () => {
    const user = userEvent.setup();
    render(<AdminReviewsPage />);
    const approve = await screen.findByRole("button", { name: "Approve" });
    const reject = screen.getByRole("button", { name: "Reject" });
    expect(approve).toBeDisabled();
    expect(reject).toBeDisabled();

    await user.type(screen.getByRole("textbox", { name: /Reason/i }), "Spam");
    expect(approve).toBeEnabled();
    await user.click(reject);
    expect(screen.getByRole("dialog", { name: "Reject this review?" })).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Reject review" }));
    expect(adminSetPlatformReviewStatus).toHaveBeenCalledWith("review-2", "REJECTED", "Spam");
  });
});
