import type { BookingStatus } from "./types";

export function canSubmitVerifiedReview(input: {
  bookingStatus: BookingStatus;
  reviewerIsCustomerOwner: boolean;
  alreadyReviewed: boolean;
}): boolean {
  if (input.alreadyReviewed) return false;
  if (!input.reviewerIsCustomerOwner) return false;
  return input.bookingStatus === "COMPLETED";
}

export function reviewRequiresCompletedBooking(): boolean {
  return true;
}
