import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it } from "vitest";
import { PaymentPausedPanel } from "../../pages/app/customer/PaymentPausedPage";
import {
  contactLockedUntilConfirmedCopy,
  paymentsComingSoonCopy,
  preBookingHeadline,
} from "./bookings";

describe("paused payment / pre-booking screen", () => {
  it("shows coming-soon copy without fake confirmation or contact unlock", () => {
    render(
      <MemoryRouter>
        <PaymentPausedPanel projectId="proj-1" bookingId="book-1" />
      </MemoryRouter>,
    );

    expect(screen.getByRole("heading", { name: /payment setup is paused/i })).toBeInTheDocument();
    expect(screen.getByText(preBookingHeadline())).toBeInTheDocument();
    expect(screen.getByText(paymentsComingSoonCopy())).toBeInTheDocument();
    expect(screen.getByText(contactLockedUntilConfirmedCopy())).toBeInTheDocument();
    expect(screen.getByText(/no payment was taken/i)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /return to project/i })).toHaveAttribute(
      "href",
      "/app/customer/projects/proj-1",
    );
    expect(screen.getByRole("link", { name: /view booking details/i })).toHaveAttribute(
      "href",
      "/app/customer/bookings/book-1",
    );
    expect(screen.queryByText(/payment succeeded/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/your booking is confirmed/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/unlock contact/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/Stripe/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/TEST MODE/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/test mode/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/Phase 4B/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/payments_live/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/charges_live/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/PaymentIntent/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/webhook/i)).not.toBeInTheDocument();
  });
});
