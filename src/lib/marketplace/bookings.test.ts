import { describe, expect, it } from "vitest";
import {
  allowedBookingTransitions,
  bookingIsAbandoned,
  bookingUnlocksContact,
  canCompleteBooking,
  canConfirmBooking,
  canCustomerCancelPending,
  canDisputeBooking,
  canStartBooking,
  canTransitionBooking,
  clientCannotSpoofConfirmed,
  contactAccessAllowsReveal,
  paymentsComingSoonCopy,
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

  it("never unlocks contact from booking status; entitlement is required", () => {
    expect(bookingUnlocksContact("PENDING")).toBe(false);
    expect(bookingUnlocksContact("AWAITING_PAYMENT")).toBe(false);
    expect(bookingUnlocksContact("CANCELLED")).toBe(false);
    expect(bookingUnlocksContact("CONFIRMED")).toBe(false);
    expect(bookingUnlocksContact("IN_PROGRESS")).toBe(false);
    expect(bookingUnlocksContact("COMPLETED")).toBe(false);
    expect(bookingUnlocksContact("DISPUTED")).toBe(false);
    expect(contactAccessAllowsReveal("LOCKED")).toBe(false);
    expect(contactAccessAllowsReveal("UNLOCKED")).toBe(true);
    expect(contactAccessAllowsReveal("ADMIN_OVERRIDE")).toBe(true);
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
