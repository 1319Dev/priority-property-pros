import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { BookingReviewPartySection } from "./BookingReviewPartySection";
import { HIDDEN_REVIEW_NOTE, REPORT_RECEIVED_NOTE, RESPONSE_CONTACT_NOTE } from "../../lib/marketplace/bookingReviewModeration";
import type { BookingReview } from "../../lib/marketplace/types";

function review(role: "CUSTOMER" | "CONTRACTOR", extra: Partial<BookingReview> = {}): BookingReview {
  return {
    id: `r-${role}`,
    booking_id: "b1",
    customer_id: "cust",
    contractor_profile_id: "pro-1",
    reviewer_role: role,
    rating: role === "CUSTOMER" ? 2 : 5,
    body: role === "CUSTOMER" ? "The gate was left unfinished." : "The homeowner cleared the side yard.",
    is_verified: true,
    created_at: "2026-10-01T15:00:00.000Z",
    ...extra,
  };
}

describe("booking review party section", () => {
  it("lets the customer report the pro review and keeps a hidden review visible", async () => {
    const user = userEvent.setup();
    const onReport = vi.fn().mockResolvedValue(undefined);
    render(
      <div className="w-[320px] max-w-[320px]">
        <BookingReviewPartySection
          role="customer"
          reviews={[review("CONTRACTOR", { hidden_at: "2026-10-04T12:00:00.000Z" })]}
          onReport={onReport}
          onRespond={vi.fn()}
        />
      </div>,
    );
    expect(screen.getByRole("region", { name: "This pro's review" })).toBeInTheDocument();
    expect(screen.getByText(HIDDEN_REVIEW_NOTE)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Post public response" })).not.toBeInTheDocument();
    const report = screen.getByRole("button", { name: "Report review" });
    expect(report).toBeDisabled();
    expect(report.className).toMatch(/w-full/);
    expect(report.className).toMatch(/min-h-11/);
    await user.type(screen.getByRole("textbox", { name: "Report reason" }), "This does not match the job.");
    expect(report).toBeEnabled();
    await user.click(report);
    expect(onReport).toHaveBeenCalledWith("r-CONTRACTOR", "This does not match the job.");
    expect(await screen.findByText(REPORT_RECEIVED_NOTE)).toBeInTheDocument();
  });

  it("lets the contractor post one response and blocks a phone number", async () => {
    const user = userEvent.setup();
    const onRespond = vi.fn().mockResolvedValue(undefined);
    render(
      <BookingReviewPartySection
        role="contractor"
        reviews={[review("CUSTOMER")]}
        onReport={vi.fn()}
        onRespond={onRespond}
      />,
    );
    const response = screen.getByRole("textbox", { name: "Your response" });
    await user.type(response, "Call me at 512-555-0199 tomorrow.");
    await user.click(screen.getByRole("button", { name: "Post public response" }));
    expect(onRespond).not.toHaveBeenCalled();
    expect(screen.getByText(RESPONSE_CONTACT_NOTE)).toBeInTheDocument();

    await user.clear(response);
    await user.type(response, "We finished the remaining gate hardware the next morning.");
    await user.click(screen.getByRole("button", { name: "Post public response" }));
    expect(onRespond).toHaveBeenCalledWith("r-CUSTOMER", "We finished the remaining gate hardware the next morning.");
  });

  it("shows an existing response instead of a second form", () => {
    render(
      <BookingReviewPartySection
        role="contractor"
        reviews={[review("CUSTOMER", { contractor_response: "We replaced the latch the next morning." })]}
        onReport={vi.fn()}
        onRespond={vi.fn()}
      />,
    );
    expect(screen.getByText("We replaced the latch the next morning.")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Post public response" })).not.toBeInTheDocument();
  });
});
