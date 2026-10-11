import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";
import { HiredConfirmationCard, ProfileReviewForm } from "./HiredConfirmation";
import { HIRED_BUTTON_LABEL, HIRED_MUTUAL_COPY, HIRED_WAITING_PRO } from "../../lib/marketplace/hired";
import type { BookingReview } from "../../lib/marketplace/types";

function review(role: "CUSTOMER" | "CONTRACTOR"): BookingReview {
  return {
    id: `r-${role}`,
    booking_id: "b1",
    customer_id: "cust",
    contractor_profile_id: "pro-1",
    reviewer_role: role,
    rating: 5,
    body: "Great work.",
    is_verified: true,
    created_at: "2026-09-21T12:00:00.000Z",
  };
}

describe("Hired confirmation card", () => {
  it("shows Hired to the customer and a waiting state after only they confirm", async () => {
    const user = userEvent.setup();
    const onConfirm = vi.fn();
    const { rerender } = render(
      <MemoryRouter>
        <HiredConfirmationCard
          role="customer"
          bookingStatus="PENDING"
          customerHiredAt={null}
          contractorHiredAt={null}
          onConfirm={onConfirm}
        />
      </MemoryRouter>,
    );
    expect(screen.getByRole("button", { name: HIRED_BUTTON_LABEL })).toBeInTheDocument();
    expect(screen.queryByText(/end (this )?job/i)).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: HIRED_BUTTON_LABEL }));
    expect(screen.getByRole("button", { name: /confirm hired/i })).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: /confirm hired/i }));
    expect(onConfirm).toHaveBeenCalledTimes(1);

    rerender(
      <MemoryRouter>
        <HiredConfirmationCard
          role="customer"
          bookingStatus="PENDING"
          customerHiredAt="2026-09-21T12:00:00Z"
          contractorHiredAt={null}
          onConfirm={onConfirm}
        />
      </MemoryRouter>,
    );
    expect(screen.getByText(HIRED_WAITING_PRO)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: HIRED_BUTTON_LABEL })).not.toBeInTheDocument();
    expect(screen.queryByText(/review this pro/i)).not.toBeInTheDocument();
  });

  it("shows Hired to the contractor while waiting on the homeowner, then mutual Hired", () => {
    const { rerender } = render(
      <MemoryRouter>
        <HiredConfirmationCard
          role="contractor"
          bookingStatus="PENDING"
          customerHiredAt="2026-09-21T12:00:00Z"
          contractorHiredAt={null}
          onConfirm={() => undefined}
        />
      </MemoryRouter>,
    );
    expect(screen.getByText(HIRED_WAITING_PRO)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: HIRED_BUTTON_LABEL })).toBeInTheDocument();

    rerender(
      <MemoryRouter>
        <HiredConfirmationCard
          role="contractor"
          bookingStatus="PENDING"
          customerHiredAt="2026-09-21T12:00:00Z"
          contractorHiredAt="2026-09-21T12:05:00Z"
          contractorProfileId="pro-1"
          onConfirm={() => undefined}
        />
      </MemoryRouter>,
    );
    expect(screen.getByText(HIRED_MUTUAL_COPY)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: HIRED_BUTTON_LABEL })).not.toBeInTheDocument();
  });
});

describe("profile review CTA", () => {
  it("hides the review form until mutual Hired and then lets each party review the other", () => {
    const { rerender } = render(
      <ProfileReviewForm
        role="customer"
        bookingStatus="PENDING"
        mutuallyHired={false}
        reviews={[]}
        rating="5"
        body=""
        onRatingChange={() => undefined}
        onBodyChange={() => undefined}
        onSubmit={() => undefined}
      />,
    );
    expect(screen.queryByRole("heading", { name: /review this pro/i })).not.toBeInTheDocument();

    rerender(
      <ProfileReviewForm
        role="customer"
        bookingStatus="PENDING"
        mutuallyHired
        reviews={[]}
        rating="5"
        body=""
        onRatingChange={() => undefined}
        onBodyChange={() => undefined}
        onSubmit={() => undefined}
      />,
    );
    expect(screen.getByRole("heading", { name: /review this pro/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /submit review/i })).toBeInTheDocument();

    rerender(
      <ProfileReviewForm
        role="contractor"
        bookingStatus="PENDING"
        mutuallyHired
        reviews={[review("CUSTOMER")]}
        rating="5"
        body=""
        onRatingChange={() => undefined}
        onBodyChange={() => undefined}
        onSubmit={() => undefined}
      />,
    );
    expect(screen.getByRole("heading", { name: /review this homeowner/i })).toBeInTheDocument();
    expect(screen.queryByRole("region", { name: "Your review" })).not.toBeInTheDocument();
  });

  it("shows your review, then the same form prefilled, and marks an edited review", async () => {
    const user = userEvent.setup();
    const now = Date.parse("2026-10-10T12:00:00.000Z");
    const onSubmit = vi.fn().mockResolvedValue(undefined);
    const posted = review("CUSTOMER");
    posted.created_at = "2026-10-01T15:00:00.000Z";
    posted.body = "The fence line is straight.";
    posted.rating = 5;

    const { rerender } = render(
      <ProfileReviewForm
        role="customer"
        bookingStatus="IN_PROGRESS"
        mutuallyHired
        reviews={[]}
        rating="5"
        body=""
        onRatingChange={() => undefined}
        onBodyChange={() => undefined}
        onSubmit={onSubmit}
        now={now}
      />,
    );
    expect(screen.getByRole("region", { name: "Leave a review" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /submit review/i })).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Your review" })).not.toBeInTheDocument();

    rerender(
      <ProfileReviewForm
        role="customer"
        bookingStatus="IN_PROGRESS"
        mutuallyHired
        reviews={[posted]}
        rating="5"
        body=""
        onRatingChange={() => undefined}
        onBodyChange={() => undefined}
        onSubmit={onSubmit}
        now={now}
      />,
    );
    expect(screen.getByRole("heading", { name: "Your review" })).toBeInTheDocument();
    expect(screen.getByText("The fence line is straight.")).toBeInTheDocument();
    expect(screen.getByLabelText("5 out of 5 stars")).toBeInTheDocument();
    expect(screen.getByText("Oct 1, 2026")).toBeInTheDocument();
    expect(screen.queryByText(/^Edited/)).not.toBeInTheDocument();
    expect(screen.queryByRole("region", { name: "Leave a review" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /submit review/i })).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Edit" }));
    expect(screen.getByRole("region", { name: "Edit your review" })).toBeInTheDocument();
    expect(screen.getByLabelText("Review")).toHaveValue("The fence line is straight.");
    expect(screen.getByRole("button", { name: "5", pressed: true })).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("Review"), { target: { value: "Updated after a rain delay." } });
    await user.click(screen.getByRole("button", { name: "4" }));
    await user.click(screen.getByRole("button", { name: /save review/i }));
    expect(onSubmit).toHaveBeenCalledWith("4", "Updated after a rain delay.");

    const edited = { ...posted, rating: 4, body: "Updated after a rain delay.", edited_at: "2026-10-03T15:00:00.000Z" };
    rerender(
      <ProfileReviewForm
        role="contractor"
        bookingStatus="IN_PROGRESS"
        mutuallyHired
        reviews={[{ ...edited, reviewer_role: "CONTRACTOR", body: "Cleared the side yard." }]}
        rating="5"
        body=""
        onRatingChange={() => undefined}
        onBodyChange={() => undefined}
        onSubmit={onSubmit}
        now={now}
      />,
    );
    expect(screen.getByRole("heading", { name: "Your review" })).toBeInTheDocument();
    expect(screen.getByText("Cleared the side yard.")).toBeInTheDocument();
    expect(screen.getByText("Edited Oct 3, 2026")).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: /review this homeowner/i })).not.toBeInTheDocument();
  });

  it("hides edit after the 30-day window and keeps the posted review visible", () => {
    const posted = review("CUSTOMER");
    posted.created_at = "2026-08-01T12:00:00.000Z";
    posted.body = "Still glad we hired them.";
    render(
      <ProfileReviewForm
        role="customer"
        bookingStatus="COMPLETED"
        mutuallyHired
        reviews={[posted]}
        rating="5"
        body=""
        onRatingChange={() => undefined}
        onBodyChange={() => undefined}
        onSubmit={() => undefined}
        now={Date.parse("2026-10-10T12:00:00.000Z")}
      />,
    );
    expect(screen.getByRole("heading", { name: "Your review" })).toBeInTheDocument();
    expect(screen.getByText("Still glad we hired them.")).toBeInTheDocument();
    expect(screen.getByText(/30-day edit window has closed/i)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Edit" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /submit review/i })).not.toBeInTheDocument();
  });

  it("does not preselect a star rating", () => {
    render(
      <ProfileReviewForm
        role="customer"
        bookingStatus="IN_PROGRESS"
        mutuallyHired
        reviews={[]}
        rating=""
        body=""
        onRatingChange={() => undefined}
        onBodyChange={() => undefined}
        onSubmit={() => undefined}
      />,
    );
    expect(screen.getByText(/choose 1 to 5 stars/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Submit review" })).toBeDisabled();
    for (const value of ["1", "2", "3", "4", "5"]) {
      expect(screen.getByRole("button", { name: value })).toHaveAttribute("aria-pressed", "false");
    }
  });
});
