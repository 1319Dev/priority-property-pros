import type { Actor } from "../auth/rlsPolicy";
import { actorIsAdmin } from "../auth/rlsPolicy";
import type { EstimateStatus, OpportunityStatus, ProjectStatus } from "./types";

export type PrivacyActor = Actor & {
  contractorProfileId?: string | null;
};

export type ProjectPrivacyRow = {
  id: string;
  customer_id: string;
  status: ProjectStatus;
  selected_contractor_profile_id?: string | null;
};

export type OpportunityPrivacyRow = {
  project_id: string;
  contractor_profile_id: string;
  status: OpportunityStatus;
  responded_at?: string | null;
};

/**
 * Customer isolation is a database rule: a customer may read a project row
 * only when they own it (or they are an admin). UI filtering is not enough.
 */
export function customerOwnsProject(actor: PrivacyActor, project: Pick<ProjectPrivacyRow, "customer_id">): boolean {
  return Boolean(actor.id) && actor.id === project.customer_id;
}

export function customerCanListProject(actor: PrivacyActor, project: ProjectPrivacyRow): boolean {
  if (!actor.id) return false;
  if (actorIsAdmin(actor)) return true;
  if (actor.accountType !== "CUSTOMER" && actor.accountType !== "ADMIN") return false;
  return customerOwnsProject(actor, project);
}

export function customerCanReadProject(actor: PrivacyActor, project: ProjectPrivacyRow): boolean {
  if (!actor.id) return false;
  if (actorIsAdmin(actor)) return true;
  return customerOwnsProject(actor, project);
}

export function customerCanEditProject(actor: PrivacyActor, project: ProjectPrivacyRow): boolean {
  return customerCanReadProject(actor, project) && project.status !== "CANCELLED";
}

export function customerCanCancelProject(actor: PrivacyActor, project: ProjectPrivacyRow): boolean {
  return customerCanReadProject(actor, project);
}

export function customerCanReadRelatedRecord(
  actor: PrivacyActor,
  project: Pick<ProjectPrivacyRow, "customer_id">,
): boolean {
  return customerCanReadProject(actor, { id: "related", customer_id: project.customer_id, status: "DRAFT" });
}

/** Direct URL / IDOR: another customer's project is not found, not merely hidden. */
export function customerProjectRouteAccess(
  actor: PrivacyActor,
  project: ProjectPrivacyRow | null,
): "ok" | "not_found" {
  if (!project) return "not_found";
  return customerCanReadProject(actor, project) ? "ok" : "not_found";
}

export function filterCustomerProjectList<T extends ProjectPrivacyRow>(actor: PrivacyActor, rows: T[]): T[] {
  return rows.filter((row) => customerCanListProject(actor, row));
}

export function contractorCanReadOpportunityProject(
  actor: PrivacyActor,
  project: ProjectPrivacyRow,
  opportunity: OpportunityPrivacyRow | null,
): boolean {
  if (!actor.id) return false;
  if (actorIsAdmin(actor)) return true;
  if (actor.accountType !== "CONTRACTOR" || !actor.contractorProfileId) return false;
  if (opportunity && opportunity.project_id === project.id && opportunity.contractor_profile_id === actor.contractorProfileId) {
    if (opportunity.status === "AVAILABLE" || opportunity.status === "ACCEPTED") return true;
    if ((opportunity.status === "CLOSED" || opportunity.status === "EXPIRED") && opportunity.responded_at) return true;
  }
  if (project.selected_contractor_profile_id === actor.contractorProfileId) return true;
  return false;
}

export function adminCanReadAnyProject(actor: PrivacyActor): boolean {
  return actorIsAdmin(actor);
}

export function customerFacingBrowseExposesPrivateProjects(): boolean {
  return false;
}

export function estimateVisibleToOwningCustomer(status: EstimateStatus): boolean {
  return status !== "DRAFT";
}

export const CUSTOMER_ISOLATION_RULES = [
  "Customer dashboard lists only projects where customer_id = auth.uid().",
  "Customer project-detail, edit, delete, and cancel require ownership.",
  "Photos, answers, estimates, bookings, notices, and private location inherit the same owner gate.",
  "Changing a project ID in the URL cannot open another customer's project.",
  "Direct table/API reads cannot list or fetch another customer's projects.",
  "Customer-facing search/find/browse never lists private project records.",
  "Contractors still see only authorized opportunity fields under matching/participation rules.",
  "Private street, phone, email, and coordinates stay locked until contact entitlement (hire + job fee or admin override), never merely because a booking is CONFIRMED.",
  "Admins retain intended cross-project access.",
] as const;
