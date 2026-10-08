import { normalizeCity, normalizeState } from "./location";
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
      message: "This unfinished project was never posted.",
    };
  }
  if (input.projectStatus === "CANCELLED") {
    return { action: "block", message: "This project is already cancelled." };
  }
  if (input.projectStatus === "CONTRACTOR_SELECTED") {
    return {
      action: "cancel",
      message:
        "This will cancel the project and the booking that is still waiting. It moves to your Cancelled list. Your street address stays private.",
    };
  }
  return {
    action: "cancel",
    message:
      "This project will be cancelled and move to your Cancelled list. Pros can no longer respond. Estimates stay in your history and are marked cancelled.",
  };
}

export type CustomerEditSnapshot = {
  title: string;
  description: string;
  category_id: string | null;
  city: string | null;
  state: string | null;
  zip_code: string | null;
  timing: string | null;
  preferred_date: string | null;
  budget_min_cents: number | null;
  budget_max_cents: number | null;
  street_line1: string;
  street_line2: string;
  answers: Record<string, string | null | undefined>;
};

export type CustomerEditPatch = ProjectPatch & {
  street_line1?: string;
  street_line2?: string;
};

function sameText(left: string | null | undefined, right: string | null | undefined): boolean {
  return (left ?? "").trim() === (right ?? "").trim();
}

/** Sends only fields that actually changed. Unchanged answers are omitted so the edit is not treated as material. */
export function buildCustomerEditPatch(saved: CustomerEditSnapshot, next: CustomerEditSnapshot): CustomerEditPatch {
  const patch: CustomerEditPatch = {};
  if (!sameText(saved.title, next.title)) patch.title = (next.title ?? "").trim();
  if (!sameText(saved.description, next.description)) patch.description = next.description ?? "";
  if ((saved.category_id ?? "") !== (next.category_id ?? "")) patch.category_id = next.category_id || null;

  const city = normalizeCity(next.city);
  if (normalizeCity(saved.city) !== city) patch.city = city;
  const state = normalizeState(next.state);
  if (normalizeState(saved.state) !== state) patch.state = state;
  const zip = (next.zip_code ?? "").trim();
  if ((saved.zip_code ?? "").trim() !== zip) patch.zip_code = zip;

  if ((saved.timing ?? "") !== (next.timing ?? "")) patch.timing = next.timing || null;
  if ((saved.preferred_date ?? "") !== (next.preferred_date ?? "")) patch.preferred_date = next.preferred_date || null;
  if ((saved.budget_min_cents ?? null) !== (next.budget_min_cents ?? null)) patch.budget_min_cents = next.budget_min_cents;
  if ((saved.budget_max_cents ?? null) !== (next.budget_max_cents ?? null)) patch.budget_max_cents = next.budget_max_cents;
  if (!sameText(saved.street_line1, next.street_line1)) patch.street_line1 = (next.street_line1 ?? "").trim();
  if (!sameText(saved.street_line2, next.street_line2)) patch.street_line2 = (next.street_line2 ?? "").trim();

  if (answersMateriallyChanged(saved.answers, next.answers)) {
    const keys = new Set([...Object.keys(saved.answers), ...Object.keys(next.answers)]);
    patch.answers = [...keys].map((question_id) => ({
      question_id,
      answer_text: (next.answers[question_id] ?? "").trim(),
    }));
  }
  return patch;
}

export function answersMateriallyChanged(
  before: Record<string, string | null | undefined>,
  after: Record<string, string | null | undefined>,
): boolean {
  const keys = new Set([...Object.keys(before), ...Object.keys(after)]);
  for (const key of keys) {
    if ((before[key] ?? "").trim() !== (after[key] ?? "").trim()) return true;
  }
  return false;
}

export function ownerCanDeletePermanently(plan: CancelPlan): boolean {
  return plan.action === "delete";
}

export function cancelledProjectsLeaveActiveOpportunities(): boolean {
  return false;
}

export function selectionCreatesRelationship(): boolean {
  return false;
}
