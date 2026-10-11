import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { AdminReviewsPage } from "./AdminReviewsPage";

const adminListPlatformReviews = vi.fn();
const adminSetPlatformReviewStatus = vi.fn();
const adminListBookingReviews = vi.fn();
const adminHideBookingReview = vi.fn();
const adminRestoreBookingReview = vi.fn();
const adminHideBookingReviewResponse = vi.fn();

vi.mock("../../../lib/marketplace/platformReviewsApi", () => ({
  adminListPlatformReviews: (...args: unknown[]) => adminListPlatformReviews(...args),
  adminSetPlatformReviewStatus: (...args: unknown[]) => adminSetPlatformReviewStatus(...args),
}));

vi.mock("../../../lib/admin/bookingReviewModerationApi", () => ({
  adminListBookingReviews: (...args: unknown[]) => adminListBookingReviews(...args),
  adminHideBookingReview: (...args: unknown[]) => adminHideBookingReview(...args),
  adminRestoreBookingReview: (...args: unknown[]) => adminRestoreBookingReview(...args),
  adminHideBookingReviewResponse: (...args: unknown[]) => adminHideBookingReviewResponse(...args),
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
    adminListBookingReviews.mockReset();
    adminHideBookingReview.mockReset();
    adminRestoreBookingReview.mockReset();
    adminHideBookingReviewResponse.mockReset();
    adminListPlatformReviews.mockResolvedValue([pending]);
    adminSetPlatformReviewStatus.mockResolvedValue(undefined);
    adminListBookingReviews.mockResolvedValue([
      {
        id: "job-low",
        booking_id: "book-low",
        reviewer_role: "CUSTOMER",
        rating: 2,
        body: "The gate was left unfinished and the old posts stayed in the yard.",
        created_at: "2026-10-02T15:00:00.000Z",
        hidden_at: null,
        hidden_reason: null,
        contractor_response: null,
        contractor_response_at: null,
        contractor_response_hidden_at: null,
        contractor_response_hidden_reason: null,
        reports: [{ reason: "The description does not match the job photos.", created_at: "2026-10-03T15:00:00.000Z" }],
      },
      {
        id: "job-high",
        booking_id: "book-high",
        reviewer_role: "CUSTOMER",
        rating: 5,
        body: "The fence line is straight and the yard was cleaned up the same day.",
        created_at: "2026-10-01T15:00:00.000Z",
        hidden_at: null,
        hidden_reason: null,
        contractor_response: "We hauled the scraps the same afternoon.",
        contractor_response_at: "2026-10-01T18:00:00.000Z",
        contractor_response_hidden_at: null,
        contractor_response_hidden_reason: null,
        reports: [],
      },
    ]);
    adminHideBookingReview.mockResolvedValue(undefined);
  });

  it("requires a reason before approve or reject and sends that reason", async () => {
    const user = userEvent.setup();
    render(<AdminReviewsPage />);
    const approve = await screen.findByRole("button", { name: /^Approve$/ });
    const reject = screen.getByRole("button", { name: /^Reject$/ });
    expect(approve).toBeDisabled();
    expect(reject).toBeDisabled();

    await user.type(screen.getByRole("textbox", { name: /Reason/i }), "Spam");
    expect(approve).toBeEnabled();
    await user.click(reject);
    expect(screen.getByRole("dialog", { name: "Reject this review?" })).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Reject review" }));
    expect(adminSetPlatformReviewStatus).toHaveBeenCalledWith("review-2", "REJECTED", "Spam");
  });

  it("requires evidence before hiding a job review and does not hide on stars alone", async () => {
    const user = userEvent.setup();
    render(
      <div className="w-[390px] max-w-[390px]">
        <AdminReviewsPage />
      </div>,
    );
    await user.click(await screen.findByRole("tab", { name: "Job reviews" }));
    expect(screen.getByText("The gate was left unfinished and the old posts stayed in the yard.")).toBeInTheDocument();
    expect(screen.getByText("The fence line is straight and the yard was cleaned up the same day.")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /hide low ratings/i })).not.toBeInTheDocument();
    const lowItem = screen.getByText(/old posts stayed in the yard/).closest("li");
    expect(lowItem).not.toBeNull();
    const lowCard = within(lowItem as HTMLElement);
    const hide = lowCard.getByRole("button", { name: "Hide review" });
    expect(hide).toBeDisabled();
    expect(hide.className).toMatch(/w-full/);

    const lowReason = lowCard.getByRole("textbox", { name: "Reason for 2 star Customer review" });
    await user.type(lowReason, "just a poor one star score");
    expect(lowCard.getByText(/cannot be hidden only because of its rating/i)).toBeInTheDocument();
    expect(hide).toBeDisabled();

    await user.clear(lowReason);
    await user.type(lowReason, "The description names a gate that was not part of this job.");
    expect(hide).toBeEnabled();
    await user.click(hide);
    const dialog = screen.getByRole("dialog", { name: "Hide this review?" });
    await user.click(within(dialog).getByRole("button", { name: "Hide review" }));
    expect(adminHideBookingReview).toHaveBeenCalledWith(
      "job-low",
      "The description names a gate that was not part of this job.",
    );
    expect(await screen.findByText(/Hidden from the public profile/)).toBeInTheDocument();
    expect(screen.getByText("The fence line is straight and the yard was cleaned up the same day.")).toBeInTheDocument();
  });

  it("keeps pending reviews in the pending queue and off the approved tab", async () => {
    const user = userEvent.setup();
    adminListPlatformReviews.mockResolvedValue([
      pending,
      {
        ...pending,
        id: "review-approved",
        display_name: "Already Public",
        body: "This one was approved before the queue changed.",
        status: "APPROVED",
      },
    ]);
    render(<AdminReviewsPage />);
    expect(await screen.findByRole("tab", { name: /Pending \(1\)/ })).toHaveAttribute("aria-selected", "true");
    expect(screen.getByText(pending.body)).toBeInTheDocument();
    expect(screen.queryByText("This one was approved before the queue changed.")).not.toBeInTheDocument();

    await user.click(screen.getByRole("tab", { name: /Approved \(1\)/ }));
    expect(screen.getByText("This one was approved before the queue changed.")).toBeInTheDocument();
    expect(screen.queryByText(pending.body)).not.toBeInTheDocument();
  });
});
