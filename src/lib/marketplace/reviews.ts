import type { BookingStatus } from "./types";
import { canSubmitProfileReview } from "./hired";

export function canSubmitVerifiedReview(input: {
  bookingStatus: BookingStatus;
  reviewerIsCustomerOwner?: boolean;
  reviewerIsParticipant?: boolean;
  alreadyReviewed: boolean;
  mutuallyHired?: boolean;
}): boolean {
  const participant = input.reviewerIsParticipant ?? input.reviewerIsCustomerOwner ?? false;
  return canSubmitProfileReview({
    bookingStatus: input.bookingStatus,
    mutuallyHired: Boolean(input.mutuallyHired),
    alreadyReviewed: input.alreadyReviewed,
    reviewerIsParticipant: participant,
  });
}

export function reviewRequiresCompletedBooking(): boolean {
  return false;
}

export function reviewRequiresMutualHired(): boolean {
  return true;
}
