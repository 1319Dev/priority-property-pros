import type { Actor } from "../auth/rlsPolicy";
import { actorIsAdmin } from "../auth/rlsPolicy";
import { contactAccessAllowsReveal } from "./bookings";
import type {
  BookingStatus,
  ContactAccessStatus,
  CredentialStatus,
  EstimateStatus,
  OpportunityStatus,
} from "./types";

export type MarketplaceActor = Actor & {
  contractorProfileId?: string | null;
};

export function canReadExactAddress(
  actor: MarketplaceActor,
  project: {
    customer_id: string;
    selected_contractor_profile_id: string | null;
  },
  bookingStatus: BookingStatus | null = null,
  contactAccess: ContactAccessStatus | null = null,
): boolean {
  if (!actor.id) return false;
  if (actorIsAdmin(actor)) return true;
  if (actor.id === project.customer_id) return true;
  if (bookingStatus === "CANCELLED") return false;
  if (!contactAccessAllowsReveal(contactAccess)) return false;
  return Boolean(actor.contractorProfileId) && actor.contractorProfileId === project.selected_contractor_profile_id;
}

export function canReadCustomerContact(
  actor: MarketplaceActor,
  customerId: string,
  opts: {
    bookingStatus: BookingStatus | null;
    contractorProfileId?: string | null;
    selectedContractorProfileId?: string | null;
    contactAccess?: ContactAccessStatus | null;
  },
): boolean {
  if (!actor.id) return false;
  if (actorIsAdmin(actor)) return true;
  if (actor.id === customerId) return true;
  if (opts.bookingStatus === "CANCELLED") return false;
  if (!contactAccessAllowsReveal(opts.contactAccess)) return false;
  if (actor.accountType !== "CONTRACTOR") return false;
  if (!opts.selectedContractorProfileId) return false;
  return Boolean(actor.contractorProfileId) && actor.contractorProfileId === opts.selectedContractorProfileId;
}

export function opportunityVisibleToCustomer(status: OpportunityStatus): boolean {
  return status === "ACCEPTED";
}

export function estimateVisibleToCustomer(status: EstimateStatus): boolean {
  return status !== "DRAFT";
}

export function estimateNeedsNewSubmission(status: EstimateStatus): boolean {
  return status === "SUPERSEDED" || status === "EXPIRED";
}

export function canSelfVerifyCredential(
  actor: MarketplaceActor,
  from: CredentialStatus,
  to: CredentialStatus,
): boolean {
  if (from === to) return true;
  if (!actor.id) return true;
  if (actorIsAdmin(actor)) return true;
  return to === "PENDING" && (from === "NOT_SUBMITTED" || from === "REJECTED" || from === "EXPIRED");
}

export function canAcceptFourthSlot(takenCount: number, max = 3): boolean {
  return takenCount < max;
}

export function canSelectSecondContractor(alreadySelected: boolean): boolean {
  return !alreadySelected;
}

export function sanitizeUploadName(name: string): string {
  const base = name.split(/[/\\]/).pop() ?? "file";
  const cleaned = base.replace(/[^a-zA-Z0-9._-]/g, "-").replace(/-+/g, "-");
  return cleaned.slice(0, 80) || "file";
}

export function isAllowedImage(mime: string): boolean {
  return ["image/jpeg", "image/png", "image/webp", "image/heic", "image/heif"].includes(mime);
}

export function isAllowedContractorDoc(mime: string): boolean {
  return isAllowedImage(mime) || mime === "application/pdf";
}
