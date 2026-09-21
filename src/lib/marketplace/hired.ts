import type { BookingStatus } from "./types";

export type HiredParty = "customer" | "contractor";

export type MutualHiredState = "idle" | "waiting_for_homeowner" | "waiting_for_pro" | "hired" | "unavailable";

export const HIRED_BUTTON_LABEL = "Hired";
export const HIRED_CONFIRM_TITLE = "Confirm hired?";
export const HIRED_CONFIRM_LABEL = "Confirm hired";
export const HIRED_CONFIRM_CANCEL = "Not yet";
export const HIRED_CONFIRM_BODY =
  "Confirm that you are working together on this job. Both the homeowner and the pro must click Hired. After both confirm, you can review each other’s profiles. This cannot be undone from here.";
export const HIRED_MUTUAL_COPY = "Hired. You can now review each other’s profiles.";
export const HIRED_WAITING_HOMEOWNER = "Waiting for homeowner to confirm Hired";
export const HIRED_WAITING_PRO = "Waiting for pro to confirm Hired";
export const HIRED_IDLE_CUSTOMER_COPY =
  "You selected this pro. Click Hired when you agree you are working together. The pro must confirm Hired too before profile reviews unlock.";
export const HIRED_IDLE_CONTRACTOR_COPY =
  "The homeowner selected you. Click Hired when you agree you are working together. The homeowner must confirm Hired too before profile reviews unlock.";

export function bookingAllowsHiredConfirmation(status: BookingStatus | null | undefined): boolean {
  return Boolean(status) && status !== "CANCELLED";
}

export function isMutuallyHired(input: {
  customerHiredAt?: string | null;
  contractorHiredAt?: string | null;
}): boolean {
  return Boolean(input.customerHiredAt && input.contractorHiredAt);
}

export function mutualHiredState(input: {
  bookingStatus: BookingStatus | null | undefined;
  customerHiredAt?: string | null;
  contractorHiredAt?: string | null;
}): MutualHiredState {
  if (!input.bookingStatus || input.bookingStatus === "CANCELLED") return "unavailable";
  const customer = Boolean(input.customerHiredAt);
  const contractor = Boolean(input.contractorHiredAt);
  if (customer && contractor) return "hired";
  if (customer) return "waiting_for_pro";
  if (contractor) return "waiting_for_homeowner";
  return "idle";
}

export function waitingForHiredCopy(state: MutualHiredState): string | null {
  if (state === "waiting_for_homeowner") return HIRED_WAITING_HOMEOWNER;
  if (state === "waiting_for_pro") return HIRED_WAITING_PRO;
  return null;
}

export function hiredStatusLabel(state: MutualHiredState): string {
  if (state === "hired") return "Hired";
  return waitingForHiredCopy(state) ?? "Confirm hired";
}

export function bookingListHiredLabel(input: {
  bookingStatus: BookingStatus | null | undefined;
  customerHiredAt?: string | null;
  contractorHiredAt?: string | null;
}): string | null {
  const state = mutualHiredState(input);
  if (state === "hired") return "Hired";
  return waitingForHiredCopy(state);
}

export function canConfirmHired(input: {
  bookingStatus: BookingStatus | null | undefined;
  role: HiredParty;
  customerHiredAt?: string | null;
  contractorHiredAt?: string | null;
}): boolean {
  if (!bookingAllowsHiredConfirmation(input.bookingStatus)) return false;
  if (input.role === "customer") return !input.customerHiredAt;
  return !input.contractorHiredAt;
}

export function idleHiredCopy(role: HiredParty): string {
  return role === "customer" ? HIRED_IDLE_CUSTOMER_COPY : HIRED_IDLE_CONTRACTOR_COPY;
}

export function canSeeReviewCta(input: {
  mutuallyHired: boolean;
  bookingStatus: BookingStatus | null | undefined;
}): boolean {
  if (!input.mutuallyHired) return false;
  if (!input.bookingStatus) return false;
  return input.bookingStatus !== "CANCELLED" && input.bookingStatus !== "DISPUTED";
}

export function canSubmitProfileReview(input: {
  bookingStatus: BookingStatus | null | undefined;
  mutuallyHired: boolean;
  alreadyReviewed: boolean;
  reviewerIsParticipant: boolean;
}): boolean {
  if (input.alreadyReviewed) return false;
  if (!input.reviewerIsParticipant) return false;
  return canSeeReviewCta({ mutuallyHired: input.mutuallyHired, bookingStatus: input.bookingStatus });
}

export function ownReviewerRole(role: HiredParty): "CUSTOMER" | "CONTRACTOR" {
  return role === "customer" ? "CUSTOMER" : "CONTRACTOR";
}

export function otherPartyLabel(role: HiredParty): string {
  return role === "customer" ? "this pro" : "this homeowner";
}
