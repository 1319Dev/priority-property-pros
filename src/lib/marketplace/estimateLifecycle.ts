import type { EstimateStatus, ProjectStatus } from "./types";
import { unauthorizedPayloadLeaksPrivateContact } from "./bookings";

/** Product "Sent" is stored as SENT (new) or SUBMITTED (legacy Phase 3). */
export const SENT_EQUIVALENT: EstimateStatus[] = ["SENT", "SUBMITTED"];

export const ACTIVE_CUSTOMER_ESTIMATE_STATUSES: EstimateStatus[] = [
  "SENT",
  "SUBMITTED",
  "REVISED",
  "VIEWED",
];

export const CUSTOMER_VISIBLE_ESTIMATE_STATUSES: EstimateStatus[] = [
  "SENT",
  "SUBMITTED",
  "REVISED",
  "VIEWED",
  "ACCEPTED",
  "DECLINED",
  "WITHDRAWN",
  "EXPIRED",
  "SUPERSEDED",
];

export type EstimateViewSource = "list" | "prefetch" | "dashboard" | "detail" | "admin" | "contractor";

export type ContractorEstimateUiStatus =
  | "sent"
  | "viewed"
  | "accepted"
  | "not_selected"
  | "withdrawn"
  | "draft"
  | "expired"
  | "superseded";

export const DECLINE_REASONS = ["CUSTOMER_DECLINED", "ANOTHER_ESTIMATE_ACCEPTED"] as const;
export type DeclineReason = (typeof DECLINE_REASONS)[number];

export const CONTRACTOR_ESTIMATE_STATUS_LABELS: Record<ContractorEstimateUiStatus, string> = {
  sent: "Sent — awaiting customer review",
  viewed: "Viewed by customer",
  accepted: "Accepted",
  not_selected: "Not Selected",
  withdrawn: "Withdrawn",
  draft: "Draft",
  expired: "Expired",
  superseded: "Needs a new estimate",
};

export const NOT_SELECTED_COPY: Record<DeclineReason, string> = {
  ANOTHER_ESTIMATE_ACCEPTED: "The customer selected another pro for this project.",
  CUSTOMER_DECLINED: "The customer decided not to move forward with this estimate.",
};

export const ACCEPTED_COPY = "The customer selected your estimate.";

export const CONTRACTOR_ESTIMATE_STATUS_DETAIL: Partial<Record<ContractorEstimateUiStatus, string>> = {
  accepted: ACCEPTED_COPY,
  not_selected: NOT_SELECTED_COPY.ANOTHER_ESTIMATE_ACCEPTED,
};

export function isSentEquivalent(status: EstimateStatus): boolean {
  return status === "SENT" || status === "SUBMITTED";
}

export function contractorEstimateUiStatus(status: EstimateStatus): ContractorEstimateUiStatus {
  if (status === "DRAFT") return "draft";
  if (isSentEquivalent(status) || status === "REVISED") return "sent";
  if (status === "VIEWED") return "viewed";
  if (status === "ACCEPTED") return "accepted";
  if (status === "DECLINED") return "not_selected";
  if (status === "WITHDRAWN") return "withdrawn";
  if (status === "EXPIRED") return "expired";
  return "superseded";
}

export function contractorEstimateStatusLabel(status: EstimateStatus): string {
  return CONTRACTOR_ESTIMATE_STATUS_LABELS[contractorEstimateUiStatus(status)];
}

export function contractorNotSelectedDetail(reason: DeclineReason | string | null | undefined): string {
  if (reason === "CUSTOMER_DECLINED") return NOT_SELECTED_COPY.CUSTOMER_DECLINED;
  if (reason === "ANOTHER_ESTIMATE_ACCEPTED") return NOT_SELECTED_COPY.ANOTHER_ESTIMATE_ACCEPTED;
  return NOT_SELECTED_COPY.CUSTOMER_DECLINED;
}

export function contractorEstimateStatusDetail(
  status: EstimateStatus,
  declineReason?: DeclineReason | string | null,
): string | null {
  const ui = contractorEstimateUiStatus(status);
  if (ui === "accepted") return ACCEPTED_COPY;
  if (ui === "not_selected") return contractorNotSelectedDetail(declineReason);
  return null;
}

export function shouldMarkEstimateViewed(source: EstimateViewSource): boolean {
  return source === "detail";
}

export type MarkViewedActor = {
  authUserId: string | null;
  accountType: "CUSTOMER" | "CONTRACTOR" | "ADMIN" | "VERIFIER" | null;
  isAdmin?: boolean;
  projectCustomerId: string;
  estimateProjectId: string;
  requestedProjectId?: string | null;
  estimateContractorProfileId: string;
  actorContractorProfileId?: string | null;
  source: EstimateViewSource;
};

export function canMarkEstimateViewed(actor: MarkViewedActor): { ok: boolean; reason?: string } {
  if (!actor.authUserId) return { ok: false, reason: "auth required" };
  if (actor.accountType !== "CUSTOMER") return { ok: false, reason: "only the customer" };
  if (actor.isAdmin && actor.accountType !== "CUSTOMER") return { ok: false, reason: "admin tooling" };
  if (actor.authUserId !== actor.projectCustomerId) return { ok: false, reason: "not the project owner" };
  if (actor.requestedProjectId && actor.requestedProjectId !== actor.estimateProjectId) {
    return { ok: false, reason: "estimate does not belong to this project" };
  }
  if (actor.actorContractorProfileId && actor.actorContractorProfileId === actor.estimateContractorProfileId) {
    return { ok: false, reason: "contractors cannot mark their own estimate viewed" };
  }
  if (!shouldMarkEstimateViewed(actor.source)) return { ok: false, reason: "not a detail open" };
  return { ok: true };
}

export function submitTargetStatus(from: EstimateStatus): EstimateStatus {
  if (from === "DRAFT") return "SENT";
  if (from === "SENT" || from === "SUBMITTED" || from === "REVISED" || from === "VIEWED") return "REVISED";
  throw new Error(`estimate cannot be submitted from status ${from}`);
}

export function canSubmitFrom(status: EstimateStatus): boolean {
  return status === "DRAFT" || isSentEquivalent(status) || status === "REVISED" || status === "VIEWED";
}

export function canWithdrawFrom(status: EstimateStatus): boolean {
  return canSubmitFrom(status);
}

export const WITHDRAW_ESTIMATE_LABEL = "Withdraw Estimate";
export const WITHDRAW_ESTIMATE_TITLE = "Withdraw this estimate?";
export const WITHDRAW_ESTIMATE_BODY =
  "The customer will be notified. Your estimate is marked Withdrawn and kept in history. It is not deleted. Submitting or withdrawing an estimate is never charged.";
export const WITHDRAW_ESTIMATE_CONFIRM = "Withdraw Estimate";

export function customerEstimateStatusLabel(status: EstimateStatus): string {
  if (status === "WITHDRAWN") return "Withdrawn";
  if (status === "ACCEPTED") return "Selected";
  if (status === "DECLINED") return "Not selected";
  if (status === "VIEWED") return "Viewed";
  if (status === "EXPIRED") return "Expired";
  if (status === "SUPERSEDED") return "Needs a new estimate";
  if (status === "DRAFT") return "Draft";
  return "Sent";
}

export function canCustomerSelectFrom(status: EstimateStatus): boolean {
  return isSentEquivalent(status) || status === "REVISED" || status === "VIEWED";
}

export function canCustomerDeclineFrom(status: EstimateStatus): boolean {
  return canCustomerSelectFrom(status);
}

export function canTransitionEstimate(from: EstimateStatus, to: EstimateStatus, via: string): boolean {
  if (from === to) return true;
  if (via === "submit_estimate") return canSubmitFrom(from) && to === submitTargetStatus(from);
  if (via === "withdraw_estimate") return canWithdrawFrom(from) && to === "WITHDRAWN";
  if (via === "mark_estimate_viewed") {
    if (to !== "VIEWED") return false;
    if (from === "VIEWED") return true;
    return isSentEquivalent(from) || from === "REVISED";
  }
  if (via === "select_estimate") {
    if (to === "ACCEPTED") return canCustomerSelectFrom(from);
    if (to === "DECLINED") return from === "DRAFT" || canCustomerSelectFrom(from);
    return false;
  }
  if (via === "decline_estimate") return canCustomerDeclineFrom(from) && to === "DECLINED";
  return false;
}

/** Clients (including the contractor who wrote the estimate) cannot forge ACCEPTED. */
export function canClientSetEstimateStatus(from: EstimateStatus, to: EstimateStatus): boolean {
  if (from === to) return true;
  return false;
}

export function cannotForgeAccepted(actorRole: "CONTRACTOR" | "CUSTOMER" | "ADMIN", to: EstimateStatus): boolean {
  if (to !== "ACCEPTED") return false;
  return actorRole !== "CUSTOMER";
}

export type ViewTracking = {
  status: EstimateStatus;
  first_viewed_at: string | null;
  last_viewed_at: string | null;
  view_count: number;
};

export function applyViewTracking(
  current: ViewTracking,
  nowIso: string,
  source: EstimateViewSource,
): ViewTracking {
  if (!shouldMarkEstimateViewed(source)) return current;
  if (!canTransitionEstimate(current.status, "VIEWED", "mark_estimate_viewed") && current.status !== "VIEWED") {
    return current;
  }
  const first = current.first_viewed_at ?? nowIso;
  return {
    status: current.status === "VIEWED" || canCustomerSelectFrom(current.status) ? "VIEWED" : current.status,
    first_viewed_at: first,
    last_viewed_at: nowIso,
    view_count: current.view_count + 1,
  };
}

export function firstViewedPreserved(before: string | null, after: string | null): boolean {
  if (!before) return true;
  return before === after;
}

export type CascadeEstimate = { id: string; status: EstimateStatus; decline_reason?: DeclineReason | null };

export function acceptanceCascade(winnerId: string, rows: CascadeEstimate[]): CascadeEstimate[] {
  return rows.map((row) => {
    if (row.id === winnerId) return { ...row, status: "ACCEPTED" as const, decline_reason: null };
    if (row.status === "DRAFT" || canCustomerSelectFrom(row.status)) {
      return { ...row, status: "DECLINED" as const, decline_reason: "ANOTHER_ESTIMATE_ACCEPTED" as const };
    }
    return row;
  });
}

export function individualDecline(targetId: string, rows: CascadeEstimate[]): CascadeEstimate[] {
  return rows.map((row) =>
    row.id === targetId ? { ...row, status: "DECLINED", decline_reason: "CUSTOMER_DECLINED" } : row,
  );
}

export type AcceptRaceResult = "accepted" | "idempotent" | "conflict";

export function resolveConcurrentAccept(opts: {
  projectLockedStatus: ProjectStatus;
  selectedEstimateId: string | null;
  candidateEstimateId: string;
}): AcceptRaceResult {
  if (opts.projectLockedStatus === "CONTRACTOR_SELECTED") {
    if (opts.selectedEstimateId === opts.candidateEstimateId) return "idempotent";
    return "conflict";
  }
  return "accepted";
}

export function rivalIdentityLeaked(detail: { winner_id?: string | null; rival_price_cents?: number | null }): boolean {
  return Boolean(detail.winner_id || detail.rival_price_cents != null);
}

export function contractorCanReadEstimate(actorContractorId: string | null, estimateContractorId: string): boolean {
  return Boolean(actorContractorId) && actorContractorId === estimateContractorId;
}

export function formatViewedTimestamp(iso: string | null): string | null {
  if (!iso) return null;
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return null;
  return date.toLocaleString();
}

export function lifecyclePayloadLeaksContact(payload: Record<string, unknown> | null | undefined): boolean {
  return unauthorizedPayloadLeaksPrivateContact(payload);
}

/** ACCEPTED / CONFIRMED on this lifecycle path do not grant phone/email/street. Contact stays on #14 entitlement. */
export function estimateStatusUnlocksContact(status: EstimateStatus): boolean {
  void status;
  return false;
}

export const LIFECYCLE_EVENTS = [
  "estimate.submitted",
  "estimate.first_viewed",
  "estimate.accepted",
  "estimate.customer_declined",
  "estimate.not_selected",
  "estimate.withdrawn",
] as const;
