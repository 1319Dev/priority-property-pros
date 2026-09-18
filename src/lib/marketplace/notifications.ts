import type { DeclineReason } from "./estimateLifecycle";
import type { EstimateStatus } from "./types";

export const NOTIFICATION_KINDS = [
  "estimate.viewed",
  "estimate.accepted",
  "estimate.declined",
  "estimate.not_selected",
  "estimate.received",
  "estimate.updated",
  "estimate.withdrawn",
  "account.rating_suspended",
  "account.rating_reinstated",
  "dispute.resolved",
] as const;

export type NotificationKind = (typeof NOTIFICATION_KINDS)[number];

export type NotificationAudience = "contractor" | "customer";

export type NotificationEvent = {
  kind: NotificationKind;
  audience: NotificationAudience;
  title: string;
  body: string;
  oncePerEntity: boolean;
};

export const NOTIFICATION_CATALOG: Record<NotificationKind, NotificationEvent> = {
  "estimate.viewed": {
    kind: "estimate.viewed",
    audience: "contractor",
    title: "Your estimate was viewed.",
    body: "Your estimate was viewed.",
    oncePerEntity: true,
  },
  "estimate.accepted": {
    kind: "estimate.accepted",
    audience: "contractor",
    title: "The customer selected your estimate.",
    body: "The customer selected your estimate.",
    oncePerEntity: true,
  },
  "estimate.declined": {
    kind: "estimate.declined",
    audience: "contractor",
    title: "The customer decided not to move forward with your estimate.",
    body: "The customer decided not to move forward with your estimate.",
    oncePerEntity: true,
  },
  "estimate.not_selected": {
    kind: "estimate.not_selected",
    audience: "contractor",
    title: "The customer selected another pro for this project.",
    body: "The customer selected another pro for this project.",
    oncePerEntity: true,
  },
  "estimate.received": {
    kind: "estimate.received",
    audience: "customer",
    title: "New estimate received",
    body: "A contractor sent an estimate for your project.",
    oncePerEntity: false,
  },
  "estimate.updated": {
    kind: "estimate.updated",
    audience: "customer",
    title: "Estimate updated",
    body: "A contractor updated an estimate on your project.",
    oncePerEntity: false,
  },
  "estimate.withdrawn": {
    kind: "estimate.withdrawn",
    audience: "customer",
    title: "Estimate withdrawn",
    body: "A contractor withdrew an estimate on your project.",
    oncePerEntity: true,
  },
  "account.rating_suspended": {
    kind: "account.rating_suspended",
    audience: "customer",
    title: "Your account is suspended because of ratings.",
    body: "Your eligible completed-job rating is below 4.00 after enough reviews. You can view history and file an appeal from Disputes.",
    oncePerEntity: false,
  },
  "account.rating_reinstated": {
    kind: "account.rating_reinstated",
    audience: "customer",
    title: "Your rating suspension was lifted.",
    body: "Your eligible rating no longer meets the automatic suspension rule.",
    oncePerEntity: false,
  },
  "dispute.resolved": {
    kind: "dispute.resolved",
    audience: "customer",
    title: "Your dispute was reviewed.",
    body: "An admin updated your dispute. Open Disputes to see the outcome.",
    oncePerEntity: false,
  },
};

export function notificationForFirstView(wasFirstView: boolean): NotificationKind | null {
  return wasFirstView ? "estimate.viewed" : null;
}

export function shouldNotifyRepeatView(existingViewedNotification: boolean): boolean {
  return !existingViewedNotification;
}

export function contractorNotificationForStatus(
  status: EstimateStatus,
  declineReason?: DeclineReason | string | null,
): NotificationKind | null {
  if (status === "VIEWED") return "estimate.viewed";
  if (status === "ACCEPTED") return "estimate.accepted";
  if (status === "DECLINED") {
    return declineReason === "ANOTHER_ESTIMATE_ACCEPTED" ? "estimate.not_selected" : "estimate.declined";
  }
  return null;
}

export function customerNotificationForSubmit(from: EstimateStatus, to: EstimateStatus): NotificationKind | null {
  if (from === "DRAFT" && (to === "SENT" || to === "SUBMITTED")) return "estimate.received";
  if (to === "REVISED") return "estimate.updated";
  return null;
}

export function customerNotificationForWithdraw(to: EstimateStatus): NotificationKind | null {
  return to === "WITHDRAWN" ? "estimate.withdrawn" : null;
}

export type InAppNotification = {
  id: string;
  recipient_profile_id: string;
  kind: NotificationKind;
  title: string;
  body: string;
  entity_type: string;
  entity_id: string | null;
  read_at: string | null;
  created_at: string;
  channel: "in_app";
};

export function notificationChannel(): "in_app" {
  return "in_app";
}
