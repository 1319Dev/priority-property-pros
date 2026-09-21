import { render, screen } from "@testing-library/react";
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
  });
});
