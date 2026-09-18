import type { AccountStatus, AccountType } from "../auth/types";
import { canFileDispute } from "./restrictions";

export const DISPUTE_CATEGORIES = [
  "FRAUDULENT_REVIEW",
  "INACCURATE_REVIEW",
  "RATING_SUSPENSION",
] as const;
export type DisputeCategory = (typeof DISPUTE_CATEGORIES)[number];

export const DISPUTE_STATUSES = [
  "OPEN",
  "UNDER_REVIEW",
  "RESOLVED_UPHELD",
  "RESOLVED_REMOVED",
  "RESOLVED_ADJUSTED",
  "CLOSED",
] as const;
export type DisputeStatus = (typeof DISPUTE_STATUSES)[number];

export const DISPUTE_RESOLUTIONS = ["UPHOLD", "REMOVE_FROM_RATING", "REINSTATE", "CLOSE"] as const;
export type DisputeResolution = (typeof DISPUTE_RESOLUTIONS)[number];

export type DisputeActor = {
  id: string | null;
  accountType: AccountType | null;
  accountStatus: AccountStatus | null;
};

export function isDisputeCategory(value: string | null | undefined): value is DisputeCategory {
  return Boolean(value && (DISPUTE_CATEGORIES as readonly string[]).includes(value));
}

export function disputeRequiresReviewId(category: DisputeCategory): boolean {
  return category === "FRAUDULENT_REVIEW" || category === "INACCURATE_REVIEW";
}

export function canCreateDispute(actor: DisputeActor, input: {
  category: string;
  explanation: string;
  disputedReviewId?: string | null;
}): string | null {
  if (!actor.id) return "sign in to file a dispute";
  if (!canFileDispute(actor.accountStatus)) return "this account cannot file a dispute";
  if (!isDisputeCategory(input.category)) return "choose a valid dispute category";
  if (input.explanation.trim().length < 12) return "explain the issue in at least 12 characters";
  if (disputeRequiresReviewId(input.category) && !input.disputedReviewId) {
    return "include the review you are disputing";
  }
  return null;
}

export function canReadDispute(actor: DisputeActor, filerId: string): boolean {
  if (!actor.id) return false;
  if (actor.accountType === "ADMIN" && actor.accountStatus === "ACTIVE") return true;
  return actor.id === filerId;
}

export function canAdminResolveDispute(actor: DisputeActor, filerId: string, targetProfileId?: string | null): string | null {
  if (!actor.id) return "sign in";
  if (actor.accountType !== "ADMIN" || actor.accountStatus !== "ACTIVE") return "only an active admin can resolve disputes";
  if (actor.id === filerId) return "you cannot resolve your own dispute";
  if (targetProfileId && actor.id === targetProfileId) return "you cannot approve or unsuspend yourself";
  return null;
}

export function resolutionToStatus(resolution: DisputeResolution): DisputeStatus {
  switch (resolution) {
    case "UPHOLD":
      return "RESOLVED_UPHELD";
    case "REMOVE_FROM_RATING":
      return "RESOLVED_REMOVED";
    case "REINSTATE":
      return "RESOLVED_ADJUSTED";
    case "CLOSE":
      return "CLOSED";
  }
}

export function resolutionRemovesFromRating(resolution: DisputeResolution): boolean {
  return resolution === "REMOVE_FROM_RATING" || resolution === "REINSTATE";
}

export function resolutionReinstates(resolution: DisputeResolution): boolean {
  return resolution === "REINSTATE";
}

export function anonymousCannotAccessDisputes(): boolean {
  return true;
}

export function disputesAreImmutableAfterResolve(status: DisputeStatus): boolean {
  return status !== "OPEN" && status !== "UNDER_REVIEW";
}

export const DISPUTE_CATEGORY_LABELS: Record<DisputeCategory, string> = {
  FRAUDULENT_REVIEW: "Fraudulent review",
  INACCURATE_REVIEW: "Inaccurate review",
  RATING_SUSPENSION: "Rating suspension appeal",
};

export const DISPUTE_STATUS_LABELS: Record<DisputeStatus, string> = {
  OPEN: "Open",
  UNDER_REVIEW: "Under review",
  RESOLVED_UPHELD: "Resolved — upheld",
  RESOLVED_REMOVED: "Resolved — removed from rating",
  RESOLVED_ADJUSTED: "Resolved — adjusted",
  CLOSED: "Closed",
};
