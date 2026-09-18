import type { AccountStatus, AccountType } from "../auth/types";

export const FULLY_BLOCKED_STATUSES: AccountStatus[] = ["DISABLED", "DELETED", "DELETED_ANONYMIZED"];

export const RESTRICTED_PARTICIPATION_STATUSES: AccountStatus[] = [
  "SUSPENDED",
  "DEACTIVATED",
  "DELETION_REQUESTED",
];

export const CLOSED_DIRECTORY_STATUSES: AccountStatus[] = [
  "SUSPENDED",
  "DEACTIVATED",
  "DELETION_REQUESTED",
  "DISABLED",
  "DELETED",
  "DELETED_ANONYMIZED",
  "PENDING",
];

export function isFullyBlockedStatus(status: AccountStatus | null | undefined): boolean {
  return Boolean(status && FULLY_BLOCKED_STATUSES.includes(status));
}

export function isRestrictedParticipation(status: AccountStatus | null | undefined): boolean {
  return Boolean(status && RESTRICTED_PARTICIPATION_STATUSES.includes(status));
}

export function canStartNewMarketplaceWork(status: AccountStatus | null | undefined): boolean {
  return status === "ACTIVE";
}

export function canViewMarketplaceHistory(status: AccountStatus | null | undefined): boolean {
  return status === "ACTIVE" || isRestrictedParticipation(status) || status === "PENDING";
}

export function canFileDispute(status: AccountStatus | null | undefined): boolean {
  return status === "ACTIVE" || isRestrictedParticipation(status);
}

export function canAppearInPublicDirectory(input: {
  approvalStatus: string | null | undefined;
  accountStatus: AccountStatus | null | undefined;
}): boolean {
  return input.approvalStatus === "APPROVED" && input.accountStatus === "ACTIVE";
}

export function newParticipationBlockedReason(
  accountType: AccountType | null | undefined,
  status: AccountStatus | null | undefined,
): string | null {
  if (canStartNewMarketplaceWork(status)) return null;
  if (status === "SUSPENDED") {
    return accountType === "CONTRACTOR"
      ? "This account is suspended and cannot take new jobs or send new estimates. Existing history is kept. You can appeal from Disputes."
      : "This account is suspended and cannot post new projects or hire. Existing history is kept. You can appeal from Disputes.";
  }
  if (status === "DEACTIVATED") {
    return "This account is deactivated and cannot start new marketplace work.";
  }
  if (status === "DELETION_REQUESTED") {
    return "This account has a deletion request in progress and cannot start new marketplace work.";
  }
  if (isFullyBlockedStatus(status)) {
    return "This account is closed.";
  }
  if (status === "PENDING") {
    return "This account is still pending and cannot start new marketplace work yet.";
  }
  return "This account cannot start new marketplace work.";
}

export function restrictionBanner(status: AccountStatus | null | undefined): string | null {
  if (status === "SUSPENDED") {
    return "Your account is suspended. You can view history and file an appeal. You cannot start new marketplace work.";
  }
  if (status === "DEACTIVATED") {
    return "Your account is deactivated. You cannot start new marketplace work.";
  }
  if (status === "DELETION_REQUESTED") {
    return "Your deletion request is in progress. You cannot start new marketplace work.";
  }
  return null;
}

export function cannotSelfUnsuspend(): boolean {
  return true;
}

export function cannotBypassRestrictionViaClientPatch(): boolean {
  return true;
}
