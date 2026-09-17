import type { EstimateStatus } from "./types";

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

export type EstimateViewSource = "list" | "prefetch" | "dashboard" | "detail";

export type ContractorEstimateUiStatus = "sent" | "viewed" | "accepted" | "not_selected" | "withdrawn" | "draft" | "expired" | "superseded";

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

export const CONTRACTOR_ESTIMATE_STATUS_DETAIL: Partial<Record<ContractorEstimateUiStatus, string>> = {
  accepted: "The customer selected your estimate.",
  not_selected: "The customer selected another pro for this project.",
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

export function contractorEstimateStatusDetail(status: EstimateStatus): string | null {
  return CONTRACTOR_ESTIMATE_STATUS_DETAIL[contractorEstimateUiStatus(status)] ?? null;
}

export function shouldMarkEstimateViewed(source: EstimateViewSource): boolean {
  return source === "detail";
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
  return actorRole === "CONTRACTOR";
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

export type CascadeEstimate = { id: string; status: EstimateStatus };

export function acceptanceCascade(winnerId: string, rows: CascadeEstimate[]): CascadeEstimate[] {
  return rows.map((row) => {
    if (row.id === winnerId) return { ...row, status: "ACCEPTED" };
    if (row.status === "DRAFT" || canCustomerSelectFrom(row.status)) {
      return { ...row, status: "DECLINED" };
    }
    return row;
  });
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
