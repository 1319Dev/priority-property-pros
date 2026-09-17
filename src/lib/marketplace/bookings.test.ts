import { describe, expect, it } from "vitest";
import {
  afterSelectEstimatePath,
  allowedBookingTransitions,
  bookingIdFromSelectResult,
  bookingIsAbandoned,
  bookingUnlocksContact,
  BOOKING_STATUS_LABELS,
  canCompleteBooking,
  canConfirmBooking,
  canCustomerCancelPending,
  canDisputeBooking,
  canStartBooking,
  canTransitionBooking,
  clientCannotSpoofConfirmed,
  contactLockedUntilConfirmedCopy,
  customerCopyContainsPaymentInternals,
  customerPayPath,
  customerPreBookingPath,
  paymentsArePaused,
  paymentsComingSoonCopy,
  postSelectCustomerCopy,
  preBookingHeadline,
  preBookingTitle,
  sanitizeCustomerFacingError,
  selectionDoesNotConfirmCopy,
} from "./bookings";

describe("booking state machine", () => {
  it("allows only the documented transitions", () => {
    expect(allowedBookingTransitions("PENDING")).toEqual(["AWAITING_PAYMENT", "CANCELLED"]);
    expect(canTransitionBooking("PENDING", "CONFIRMED")).toBe(false);
    expect(canTransitionBooking("AWAITING_PAYMENT", "CONFIRMED")).toBe(true);
    expect(canTransitionBooking("CONFIRMED", "IN_PROGRESS")).toBe(true);
    expect(canTransitionBooking("IN_PROGRESS", "COMPLETED")).toBe(true);
    expect(canTransitionBooking("COMPLETED", "CANCELLED")).toBe(false);
    expect(canTransitionBooking("CANCELLED", "CONFIRMED")).toBe(false);
    expect(canTransitionBooking("DISPUTED", "COMPLETED")).toBe(false);
  });

  it("does not let customers or contractors confirm while payments are not live", () => {
    expect(canConfirmBooking({ accountType: "CUSTOMER", paymentsLive: false })).toBe(false);
    expect(canConfirmBooking({ accountType: "CONTRACTOR", paymentsLive: false })).toBe(false);
    expect(canConfirmBooking({ accountType: "ADMIN", paymentsLive: false })).toBe(true);
    expect(clientCannotSpoofConfirmed()).toBe(true);
    expect(paymentsComingSoonCopy()).toMatch(/online payment setup is coming soon/i);
  });

  it("unlocks contact only after CONFIRMED, not on pending selection", () => {
    expect(bookingUnlocksContact("PENDING")).toBe(false);
    expect(bookingUnlocksContact("AWAITING_PAYMENT")).toBe(false);
    expect(bookingUnlocksContact("CANCELLED")).toBe(false);
    expect(bookingUnlocksContact("CONFIRMED")).toBe(true);
    expect(bookingUnlocksContact("IN_PROGRESS")).toBe(true);
    expect(bookingUnlocksContact("COMPLETED")).toBe(true);
    expect(bookingUnlocksContact("DISPUTED")).toBe(true);
  });

  it("treats stale pending bookings as abandoned without a relationship", () => {
    expect(bookingIsAbandoned("PENDING", "2020-01-01T00:00:00Z")).toBe(true);
    expect(bookingIsAbandoned("CONFIRMED", "2020-01-01T00:00:00Z")).toBe(false);
    expect(canCustomerCancelPending("PENDING")).toBe(true);
    expect(canCustomerCancelPending("CONFIRMED")).toBe(false);
  });

  it("gates start / complete / dispute by role and status", () => {
    expect(canStartBooking("CONTRACTOR", "CONFIRMED")).toBe(true);
    expect(canStartBooking("CUSTOMER", "CONFIRMED")).toBe(false);
    expect(canCompleteBooking("CUSTOMER", "IN_PROGRESS")).toBe(true);
    expect(canCompleteBooking("CONTRACTOR", "PENDING")).toBe(false);
    expect(canDisputeBooking("CUSTOMER", "COMPLETED")).toBe(true);
    expect(canDisputeBooking("VERIFIER", "IN_PROGRESS")).toBe(false);
  });
});

describe("pre-booking / paused-payment UX boundary", () => {
  it("pauses payments when flags are off or the app env is staging", () => {
    expect(paymentsArePaused()).toBe(true);
    expect(paymentsArePaused({ paymentsLive: false, chargesLive: false, appEnv: "production" })).toBe(true);
    expect(paymentsArePaused({ paymentsLive: true, chargesLive: false, appEnv: "production" })).toBe(true);
    expect(paymentsArePaused({ paymentsLive: true, chargesLive: true, appEnv: "staging" })).toBe(true);
    expect(paymentsArePaused({ paymentsLive: true, chargesLive: true, appEnv: "production" })).toBe(false);
  });

  it("sends hire/select to the gated pay screen, not a live checkout", () => {
    expect(BOOKING_STATUS_LABELS.PENDING).toBe("Pre-booking");
    expect(BOOKING_STATUS_LABELS.AWAITING_PAYMENT).toBe("Pre-booking");
    expect(bookingIdFromSelectResult({ booking_id: "bk-1" })).toBe("bk-1");
    expect(bookingIdFromSelectResult({})).toBeNull();
    expect(afterSelectEstimatePath({ projectId: "p1", bookingId: "bk-1", paymentsPaused: true })).toBe(
      customerPayPath("bk-1"),
    );
    expect(afterSelectEstimatePath({ projectId: "p1", bookingId: null, paymentsPaused: true })).toBe(
      customerPreBookingPath("p1"),
    );
    expect(paymentsComingSoonCopy()).toBe("Online payment setup is coming soon.");
    expect(preBookingTitle()).toMatch(/paused/i);
    expect(preBookingHeadline()).toMatch(/not a confirmed booking/i);
    expect(selectionDoesNotConfirmCopy()).toMatch(/does not confirm the job/i);
    expect(contactLockedUntilConfirmedCopy()).toMatch(/cannot see your exact address, phone, or email/i);
    expect(contactLockedUntilConfirmedCopy()).not.toMatch(/can see your exact address/i);
  });

  it("never exposes Stripe or payment internals in post-select customer copy or leaked errors", () => {
    for (const copy of postSelectCustomerCopy()) {
      expect(customerCopyContainsPaymentInternals(copy)).toBe(false);
    }
    expect(sanitizeCustomerFacingError("Could not select this contractor.")).toBe(
      "Could not select this contractor.",
    );
    expect(sanitizeCustomerFacingError("Stripe TEST MODE PaymentIntent webhook failed", "Selection failed.")).toBe(
      "Selection failed.",
    );
    expect(sanitizeCustomerFacingError("payments_live must stay false")).toBe(
      "Something went wrong. Please try again.",
    );
    expect(sanitizeCustomerFacingError("charges_live check failed")).toBe(
      "Something went wrong. Please try again.",
    );
  });
});
