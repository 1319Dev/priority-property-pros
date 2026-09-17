import type { BookingStatus, ProjectStatus } from "./types";

export const MATERIAL_PROJECT_FIELDS = [
  "category_id",
  "description",
  "answers",
  "photos",
  "city",
  "state",
  "zip_code",
] as const;

export const MINOR_PROJECT_FIELDS = ["title", "timing", "preferred_date", "budget_min_cents", "budget_max_cents"] as const;

export type ProjectPatch = {
  title?: string | null;
  description?: string | null;
  category_id?: string | null;
  city?: string | null;
  state?: string | null;
  zip_code?: string | null;
  timing?: string | null;
  preferred_date?: string | null;
  budget_min_cents?: number | null;
  budget_max_cents?: number | null;
  answers?: unknown;
  photos?: unknown;
};

export type EditClass = "none" | "minor" | "material";

export type ParticipationState = {
  acceptedOpportunityCount: number;
  submittedEstimateCount: number;
  opportunityCount: number;
};

export type ProtectedBookingStatus = Extract<
  BookingStatus,
  "CONFIRMED" | "IN_PROGRESS" | "COMPLETED" | "DISPUTED"
>;

const PROTECTED_BOOKING: readonly BookingStatus[] = ["CONFIRMED", "IN_PROGRESS", "COMPLETED", "DISPUTED"];

export function bookingIsProtected(status: BookingStatus | null | undefined): status is ProtectedBookingStatus {
  return Boolean(status && PROTECTED_BOOKING.includes(status));
}

export function hasParticipation(state: ParticipationState): boolean {
  return state.acceptedOpportunityCount > 0 || state.submittedEstimateCount > 0;
}

export function classifyProjectPatch(patch: ProjectPatch): EditClass {
  const material = MATERIAL_PROJECT_FIELDS.some((field) => patch[field] !== undefined);
  const minor = MINOR_PROJECT_FIELDS.some((field) => patch[field] !== undefined);
  if (material) return "material";
  if (minor) return "minor";
  return "none";
}

export function canOwnerEditProject(input: {
  isOwner: boolean;
  actorIsContractor: boolean;
  isAdmin: boolean;
  projectStatus: ProjectStatus;
  bookingStatus: BookingStatus | null;
}): boolean {
  if (input.actorIsContractor && !input.isOwner && !input.isAdmin) return false;
  if (!input.isOwner && !input.isAdmin) return false;
  if (input.projectStatus === "CANCELLED") return false;
  if (bookingIsProtected(input.bookingStatus)) return false;
  return true;
}

export type MaterialEditPlan =
  | { ok: true; effect: "apply" }
  | { ok: true; effect: "invalidate_estimates"; message: string }
  | { ok: false; code: "not_owner" | "blocked_selected" | "blocked_booking" | "blocked_cancelled" | "blocked_category"; message: string };

export function planMaterialEdit(input: {
  isOwner: boolean;
  isAdmin: boolean;
  projectStatus: ProjectStatus;
  bookingStatus: BookingStatus | null;
  participation: ParticipationState;
  changingCategory: boolean;
}): MaterialEditPlan {
  if (!input.isOwner && !input.isAdmin) {
    return { ok: false, code: "not_owner", message: "Only the project owner can edit this project." };
  }
  if (input.projectStatus === "CANCELLED") {
    return { ok: false, code: "blocked_cancelled", message: "Cancelled projects cannot be edited." };
  }
  if (bookingIsProtected(input.bookingStatus)) {
    return {
      ok: false,
      code: "blocked_booking",
      message: "This job is already confirmed. Scope changes use a change order, not a silent project edit.",
    };
  }
  if (input.projectStatus === "CONTRACTOR_SELECTED") {
    return {
      ok: false,
      code: "blocked_selected",
      message: "A contractor is already selected. Cancel the pending booking before changing the job details.",
    };
  }
  if (input.changingCategory && hasParticipation(input.participation)) {
    return {
      ok: false,
      code: "blocked_category",
      message: "The service type cannot change after contractors have already priced this job.",
    };
  }
  if (hasParticipation(input.participation) || input.projectStatus === "ESTIMATES_AVAILABLE") {
    return {
      ok: true,
      effect: "invalidate_estimates",
      message:
        "This changes the job contractors already priced. Existing estimates will be marked out of date and those pros will need to send a new estimate.",
    };
  }
  return { ok: true, effect: "apply" };
}

export type CancelPlan =
  | { action: "delete"; message: string }
  | { action: "cancel"; message: string }
  | { action: "block"; message: string };

export function planDeleteOrCancel(input: {
  isOwner: boolean;
  isAdmin: boolean;
  projectStatus: ProjectStatus;
  bookingStatus: BookingStatus | null;
  participation: ParticipationState;
}): CancelPlan {
  if (!input.isOwner && !input.isAdmin) {
    return { action: "block", message: "Only the project owner can remove this project." };
  }
  if (bookingIsProtected(input.bookingStatus)) {
    return {
      action: "block",
      message:
        "This job is already confirmed or in progress. It cannot be deleted. Cancel through the booking only if PPP support or a dispute applies.",
    };
  }
  if (input.projectStatus === "DRAFT" && !hasParticipation(input.participation) && input.participation.opportunityCount === 0) {
    return {
      action: "delete",
      message: "This draft will be permanently removed. This cannot be undone.",
    };
  }
  if (!hasParticipation(input.participation) && input.participation.opportunityCount === 0 && input.projectStatus !== "CONTRACTOR_SELECTED") {
    return {
      action: "delete",
      message: "This project has no contractor activity yet. It will be permanently removed.",
    };
  }
  if (input.projectStatus === "CANCELLED") {
    return { action: "block", message: "This project is already cancelled." };
  }
  if (input.projectStatus === "CONTRACTOR_SELECTED") {
    return {
      action: "cancel",
      message:
        "This will cancel the pending booking and withdraw the project. Your exact address was never shared, and selecting a pro did not hire them.",
    };
  }
  return {
    action: "cancel",
    message:
      "This project will be cancelled. It leaves the marketplace and contractors can no longer participate. Estimates are kept for your records and labeled cancelled.",
  };
}

export function ownerCanDeletePermanently(plan: CancelPlan): boolean {
  return plan.action === "delete";
}

export function cancelledProjectsLeaveActiveOpportunities(): boolean {
  return true;
}

export function selectionCreatesRelationship(): boolean {
  return false;
}
