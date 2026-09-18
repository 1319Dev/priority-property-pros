import type { AccountStatus, AccountType } from "../auth/types";
import { canReadDispute, canAdminResolveDispute, type DisputeActor } from "./disputes";
import { canStartNewMarketplaceWork, cannotSelfUnsuspend } from "./restrictions";
import { clientCannotInsertArbitraryReview, reviewEligibilityError, type ReviewEligibilityInput } from "./reviews";

export type IdorActor = DisputeActor & { accountType: AccountType | null };

export function anonCannotReadDisputes(actor: IdorActor, filerId: string): boolean {
  return canReadDispute(actor, filerId) === false;
}

export function userCannotAlterOthersReview(actorId: string, reviewerId: string): boolean {
  return actorId !== reviewerId;
}

export function userCannotUnsuspendSelf(actor: IdorActor, targetProfileId: string): boolean {
  return cannotSelfUnsuspend() && (actor.id === targetProfileId || Boolean(canAdminResolveDispute(actor, "other", targetProfileId)));
}

export function restrictedCannotStartWorkViaRpc(status: AccountStatus): boolean {
  return canStartNewMarketplaceWork(status) === false;
}

export function strangerCannotReviewJob(input: ReviewEligibilityInput): boolean {
  return reviewEligibilityError(input) !== null;
}

export function arbitraryUuidReviewBlocked(): boolean {
  return clientCannotInsertArbitraryReview();
}

export const IDOR_MATRIX = [
  "anon cannot read or create disputes",
  "users cannot alter another person’s review",
  "users cannot unsuspend themselves",
  "admins cannot resolve their own dispute",
  "admins cannot self-unsuspend",
  "deleted and suspended accounts cannot start new work through RPC",
  "reviews require a completed-job relationship",
  "contact stays locked without a connection",
  "public browse stays anonymized",
] as const;
