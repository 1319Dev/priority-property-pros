import type { AccountStatus, AccountType } from "../auth/types";
import type { BookingStatus, OpportunityStatus, ProjectStatus } from "./types";

export const PROJECT_STATUS_LABELS: Record<ProjectStatus, string> = {
  DRAFT: "Draft",
  POSTED: "Posted",
  MATCHING: "Finding Pros",
  CONTRACTORS_RESPONDING: "Finding Pros",
  ESTIMATES_AVAILABLE: "Estimates Received",
  CONTRACTOR_SELECTED: "Contractor Selected",
  CANCELLED: "Cancelled",
};

export const BOOKING_HUMAN_LABELS: Record<BookingStatus, string> = {
  PENDING: "Booking",
  AWAITING_PAYMENT: "Booking",
  CONFIRMED: "Active",
  IN_PROGRESS: "Active",
  COMPLETED: "Completed",
  CANCELLED: "Cancelled",
  DISPUTED: "Disputed",
};

export const OPPORTUNITY_STATUS_LABELS: Record<OpportunityStatus, string> = {
  AVAILABLE: "Open",
  ACCEPTED: "Participating",
  PASSED: "Passed",
  EXPIRED: "Expired",
  CLOSED: "Closed",
};

export type CustomerLifecycleState =
  | "draft"
  | "posted"
  | "finding_pros"
  | "estimates_received"
  | "contractor_selected"
  | "booking"
  | "active"
  | "completed"
  | "cancelled";

export const CUSTOMER_LIFECYCLE_LABELS: Record<CustomerLifecycleState, string> = {
  draft: "Draft",
  posted: "Posted",
  finding_pros: "Finding Pros",
  estimates_received: "Estimates Received",
  contractor_selected: "Contractor Selected",
  booking: "Booking",
  active: "Active",
  completed: "Completed",
  cancelled: "Cancelled",
};

export function customerLifecycleState(
  projectStatus: ProjectStatus,
  bookingStatus: BookingStatus | null = null,
): CustomerLifecycleState {
  if (projectStatus === "CANCELLED" || bookingStatus === "CANCELLED") return "cancelled";
  if (bookingStatus === "COMPLETED") return "completed";
  if (bookingStatus === "CONFIRMED" || bookingStatus === "IN_PROGRESS" || bookingStatus === "DISPUTED") return "active";
  if (bookingStatus === "PENDING" || bookingStatus === "AWAITING_PAYMENT") return "booking";
  if (projectStatus === "CONTRACTOR_SELECTED") return "contractor_selected";
  if (projectStatus === "ESTIMATES_AVAILABLE") return "estimates_received";
  if (projectStatus === "MATCHING" || projectStatus === "CONTRACTORS_RESPONDING") return "finding_pros";
  if (projectStatus === "POSTED") return "posted";
  return "draft";
}

export function customerLifecycleLabel(projectStatus: ProjectStatus, bookingStatus: BookingStatus | null = null): string {
  return CUSTOMER_LIFECYCLE_LABELS[customerLifecycleState(projectStatus, bookingStatus)];
}

export type NextAction = { label: string; to: string; variant?: "primary" | "outline" | "ghost" };

export function customerNextActions(input: {
  projectId: string;
  projectStatus: ProjectStatus;
  bookingId?: string | null;
  bookingStatus?: BookingStatus | null;
}): NextAction[] {
  const state = customerLifecycleState(input.projectStatus, input.bookingStatus ?? null);
  const detail = `/app/customer/projects/${input.projectId}`;
  const wizard = `/app/customer/projects/${input.projectId}/wizard`;
  const edit = `/app/customer/projects/${input.projectId}/edit`;
  const compare = `/app/customer/projects/${input.projectId}/compare`;
  const booking = input.bookingId ? `/app/customer/bookings/${input.bookingId}` : null;

  switch (state) {
    case "draft":
      return [{ label: "Finish project", to: wizard }];
    case "posted":
    case "finding_pros":
      return [
        { label: "View", to: detail },
        { label: "Edit", to: edit, variant: "outline" },
      ];
    case "estimates_received":
      return [
        { label: "Review estimates", to: compare },
        { label: "Compare", to: compare, variant: "outline" },
        { label: "Edit", to: edit, variant: "ghost" },
      ];
    case "contractor_selected":
    case "booking":
      return [
        ...(booking ? [{ label: "View booking", to: booking }] : []),
        { label: "View", to: detail, variant: "outline" },
      ];
    case "active":
      return booking ? [{ label: "View booking", to: booking }] : [{ label: "View", to: detail }];
    case "completed":
      return [
        { label: "Hire again", to: "/app/customer/hire-again" },
        { label: "View", to: detail, variant: "outline" },
      ];
    case "cancelled":
      return [{ label: "View", to: detail, variant: "outline" }];
  }
}

export function opportunityNextActions(input: {
  opportunityId: string;
  status: OpportunityStatus;
  projectStatus: ProjectStatus;
}): NextAction[] {
  const detail = `/app/pro/opportunities/${input.opportunityId}`;
  if (input.projectStatus === "CANCELLED") {
    return [{ label: "View history", to: detail, variant: "outline" }];
  }
  if (input.status === "AVAILABLE") {
    return [{ label: "Connect", to: detail }];
  }
  if (input.status === "ACCEPTED") {
    return [
      { label: "View job", to: detail },
      { label: "Build estimate", to: `${detail}/estimate`, variant: "outline" },
    ];
  }
  return [{ label: "View history", to: detail, variant: "outline" }];
}

export function accountTypeLabel(value: AccountType | null | undefined): string {
  switch (value) {
    case "CUSTOMER":
      return "Customer";
    case "CONTRACTOR":
      return "Contractor";
    case "VERIFIER":
      return "Verifier";
    case "ADMIN":
      return "Admin";
    default:
      return "Account";
  }
}

export function accountStatusLabel(value: AccountStatus | null | undefined): string {
  switch (value) {
    case "ACTIVE":
      return "Active";
    case "PENDING":
      return "Pending";
    case "SUSPENDED":
      return "Suspended";
    case "DISABLED":
      return "Disabled";
    case "DELETED":
      return "Deleted";
    default:
      return "Unknown";
  }
}

export const CUSTOMER_DASHBOARD_TABS = [
  { key: "drafts", label: "Drafts", states: ["draft"] as const },
  { key: "active", label: "Active", states: ["posted", "finding_pros", "estimates_received", "contractor_selected", "booking", "active"] as const },
  { key: "completed", label: "Completed", states: ["completed"] as const },
  { key: "cancelled", label: "Cancelled", states: ["cancelled"] as const },
] as const;

export type CustomerDashboardTab = (typeof CUSTOMER_DASHBOARD_TABS)[number]["key"];
