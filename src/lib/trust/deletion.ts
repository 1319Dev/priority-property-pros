import type { AccountStatus } from "../auth/types";
import { isFullyBlockedStatus } from "./restrictions";

export const DELETE_CONFIRM_PHRASE = "DELETE";

export const DELETION_CONSEQUENCES = [
  "Your account is removed from the public directory and from new marketplace work.",
  "You will not be able to post projects, hire, take new jobs, or send new estimates.",
  "Job history, fees, reviews, disputes, and audit records are kept for legal and marketplace integrity.",
  "Your public name and contact details are replaced with a generic deleted-account label.",
  "This does not erase completed-job history that other people already relied on.",
] as const;

export type DeletionLifecycle = Extract<
  AccountStatus,
  "DEACTIVATED" | "SUSPENDED" | "DELETION_REQUESTED" | "DELETED_ANONYMIZED" | "DELETED"
>;

export function deletionConfirmError(phrase: string): string | null {
  if (phrase.trim() !== DELETE_CONFIRM_PHRASE) {
    return `Type ${DELETE_CONFIRM_PHRASE} to confirm you want to close this account.`;
  }
  return null;
}

export function nextDeletionStatus(from: AccountStatus): AccountStatus {
  if (from === "DELETED_ANONYMIZED" || from === "DELETED") return "DELETED_ANONYMIZED";
  if (from === "DELETION_REQUESTED") return "DELETED_ANONYMIZED";
  return "DELETION_REQUESTED";
}

export function anonymizedProfileFields(profileId: string): {
  first_name: string;
  last_name: string;
  phone: null;
  avatar_url: null;
  email: string;
} {
  return {
    first_name: "Deleted",
    last_name: "User",
    phone: null,
    avatar_url: null,
    email: `deleted+${profileId}@invalid.invalid`,
  };
}

export function anonymizedContractorFields(): {
  business_name: string;
  website_url: null;
  license_number: null;
  insurance_carrier: null;
  phone_cleared: true;
  accepting_work: false;
} {
  return {
    business_name: "Deleted business",
    website_url: null,
    license_number: null,
    insurance_carrier: null,
    phone_cleared: true,
    accepting_work: false,
  };
}

export function deletedAccountRemovedFromDirectory(status: AccountStatus): boolean {
  return status !== "ACTIVE";
}

export function deletedAccountCannotStartWork(status: AccountStatus): boolean {
  return status !== "ACTIVE";
}

export function deletionPreservesLegalHistory(): boolean {
  return true;
}

export function alreadyClosedAccount(status: AccountStatus): boolean {
  return isFullyBlockedStatus(status);
}

export function reauthRequiredForDeletion(): boolean {
  return true;
}
