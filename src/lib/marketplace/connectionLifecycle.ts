import { claimSlotExclusive, nextOpportunitySlot } from "./slots";
import {
  CONNECTION_FEE_CENTS,
  MAX_COMPLETED_CONNECTIONS,
  type ContactAccessStatus,
  type ProjectConnectionStatus,
} from "./types";
import { contactAccessAllowsReveal } from "./bookings";
import { connectionFeeCents } from "./connectionFee";

export const CONNECTION_OCCUPYING_STATUSES: ProjectConnectionStatus[] = [
  "RESERVED",
  "PAYMENT_DISABLED",
  "PAID",
  "COMPLETED",
];

export const CONNECTION_COMPLETED_STATUSES: ProjectConnectionStatus[] = ["PAID", "COMPLETED"];

export const CONNECT_BUTTON_LABEL = "Connect — $4.99";

export const CONNECTED_LABEL = "Connected";

export const CONNECTED_BODY =
  "Your $4.99 connection is active for this project. Contact is unlocked for this project only.";

export const CHECKOUT_PENDING_COPY =
  "Checkout is in progress. Contact stays locked until the server verifies the $4.99 payment.";

export const CONNECT_CONFIRM_TITLE = "Connect with this customer for $4.99?";

export const CONNECT_CONFIRM_BODY =
  "This purchases connection access to this customer. It does not guarantee a hire. Project payment is made directly between the homeowner or business and the contractor. PPP takes no percentage of the job.";

export const CONNECT_CHECKOUT_CONFIRM_EXTRA =
  "If checkout is available you will continue to a $4.99 payment page. Contact stays locked until the server verifies that payment. Returning from checkout does not unlock contact by itself.";

export const CONNECT_PAYMENTS_OFF_COPY =
  "Connection requested. Online payment setup is coming soon. Contact stays locked until a trusted $4.99 payment is verified. Clicking Connect does not unlock contact.";

export const CONNECT_REDIRECTING_COPY = "Continuing to $4.99 checkout. Contact stays locked until payment is verified.";

export const CONNECT_DOES_NOT_UNLOCK_COPY =
  "Clicking Connect does not unlock name, phone, email, or exact street. The success page cannot grant access.";

export const CONNECTION_FEE_NO_GUARANTEE =
  "The $4.99 Connection Fee buys connection access. It does not guarantee a hire or the work.";

export const REFUND_CONCEPT_COPY =
  "The $4.99 Connection Fee buys connection access, not a guaranteed job. No automatic refund if you are not hired, the customer chooses someone else, the customer cancels, or you change your mind. If a charge is taken but entitlement is not granted, that technical failure is eligible for correction. Fraud is handled through dispute and admin review. Legal copy requires attorney review.";

export function occupiesConnectionSlot(status: ProjectConnectionStatus): boolean {
  return CONNECTION_OCCUPYING_STATUSES.includes(status);
}

export function countsAsCompletedConnection(status: ProjectConnectionStatus): boolean {
  return CONNECTION_COMPLETED_STATUSES.includes(status);
}

export function countOccupiedConnectionSlots(
  statuses: ProjectConnectionStatus[],
  max = MAX_COMPLETED_CONNECTIONS,
): number {
  void max;
  return statuses.filter(occupiesConnectionSlot).length;
}

export function countCompletedConnections(statuses: ProjectConnectionStatus[]): number {
  return statuses.filter(countsAsCompletedConnection).length;
}

export function remainingConnectionSpots(
  statuses: ProjectConnectionStatus[],
  max = MAX_COMPLETED_CONNECTIONS,
): number {
  return Math.max(0, max - countOccupiedConnectionSlots(statuses, max));
}

export type ContractorConnectionUiState = "connect" | "checkout_pending" | "connected" | "requested" | "full" | "closed";

export function contractorConnectionUiState(input: {
  cancelled?: boolean;
  accepting?: boolean;
  remaining?: number;
  myConnectionStatus?: ProjectConnectionStatus | null;
  reservedUntil?: string | Date | null;
  now?: Date;
}): ContractorConnectionUiState {
  if (input.myConnectionStatus === "PAID" || input.myConnectionStatus === "COMPLETED") return "connected";
  if (input.myConnectionStatus === "PAYMENT_DISABLED") return "requested";
  if (input.cancelled || input.accepting === false) return "closed";
  if (input.myConnectionStatus === "RESERVED") {
    const until = input.reservedUntil;
    const now = input.now ?? new Date();
    if (!until || new Date(until).getTime() > now.getTime()) return "checkout_pending";
  }
  if ((input.remaining ?? 1) <= 0) return "full";
  return "connect";
}

export function showConnectButton(state: ContractorConnectionUiState): boolean {
  return state === "connect" || state === "checkout_pending";
}

export function connectionAvailabilityCopy(
  remaining: number,
  opts: { accepting?: boolean; max?: number } = {},
): string {
  const max = opts.max ?? MAX_COMPLETED_CONNECTIONS;
  if (opts.accepting === false) return "Connections closed";
  if (remaining <= 0) return "Connections Full";
  if (remaining === max) return `${max} connection spots available`;
  return `${remaining} of ${max} remaining`;
}

export function canRequestConnection(input: {
  actorContractorProfileId: string | null | undefined;
  targetContractorProfileId: string;
  existingForPair: boolean;
  occupied: number;
  acceptingConnections: boolean;
  paymentsLive?: boolean;
  max?: number;
}): { ok: boolean; reason?: string } {
  if (!input.actorContractorProfileId) return { ok: false, reason: "contractor required" };
  if (input.actorContractorProfileId !== input.targetContractorProfileId) {
    return { ok: false, reason: "contractor cannot create a connection for another contractor" };
  }
  if (input.existingForPair) return { ok: false, reason: "duplicate connection" };
  if (input.acceptingConnections === false) return { ok: false, reason: "customer stopped new connections" };
  const max = input.max ?? MAX_COMPLETED_CONNECTIONS;
  if (input.occupied >= max) return { ok: false, reason: "connections full" };
  return { ok: true };
}

export function requestConnectionOutcome(paymentsLive = false): ProjectConnectionStatus {
  if (paymentsLive) return "RESERVED";
  return "PAYMENT_DISABLED";
}

/** Connect click never marks PAID/COMPLETED and never grants entitlement. */
export function connectClickUnlocksContact(): boolean {
  return false;
}

export function connectClickSetsPaid(): boolean {
  return false;
}

export function paymentDisabledCannotBeBypassed(paymentsLive: boolean, chargesLive: boolean): boolean {
  if (!paymentsLive || !chargesLive) return true;
  return false;
}

export function finalizeConnectionPayment(input: {
  paymentsLive: boolean;
  chargesLive: boolean;
  clientPaid?: boolean;
  clientFeeCents?: number;
}): { ok: false; reason: string } | { ok: true; status: "COMPLETED"; fee_cents: number } {
  if (!input.paymentsLive || !input.chargesLive) {
    return { ok: false, reason: "connection-fee contact unlock is disabled while payments are off" };
  }
  if (input.clientPaid) {
    return { ok: false, reason: "client cannot mark a connection paid" };
  }
  if (input.clientFeeCents != null && input.clientFeeCents !== CONNECTION_FEE_CENTS) {
    return { ok: false, reason: "client cannot change the connection price" };
  }
  return { ok: false, reason: "connection-fee contact unlock is not wired" };
}

export function connectionClickResult(input: {
  paymentsLive?: boolean;
  chargesLive?: boolean;
}): {
  status: ProjectConnectionStatus;
  fee_cents: number;
  contactUnlocked: false;
  paid: false;
} {
  void input.chargesLive;
  return {
    status: requestConnectionOutcome(Boolean(input.paymentsLive)),
    fee_cents: connectionFeeCents(),
    contactUnlocked: false,
    paid: false,
  };
}

export function reserveConnectionSlot(
  taken: Set<number>,
  max = MAX_COMPLETED_CONNECTIONS,
): number | null {
  return claimSlotExclusive(taken, max);
}

export function nextConnectionSlot(taken: Iterable<number>, max = MAX_COMPLETED_CONNECTIONS): number | null {
  return nextOpportunitySlot(taken, max);
}

export function stopNewConnectionsPreservesUnlocked(existingUnlocked: boolean): boolean {
  return existingUnlocked;
}

export function customerCanStopNewConnections(actorCustomerId: string, projectCustomerId: string): boolean {
  return actorCustomerId === projectCustomerId;
}

export function customerCanControlOtherCustomersProject(
  actorCustomerId: string,
  projectCustomerId: string,
): boolean {
  return actorCustomerId === projectCustomerId;
}

export function connectionEntitlementAllowsReveal(
  row: { status: ContactAccessStatus; revoked_at?: string | null } | null | undefined,
): boolean {
  if (!row) return false;
  if (row.revoked_at) return false;
  return contactAccessAllowsReveal(row.status);
}

export function anonymizedOpportunityFields(): readonly string[] {
  return [
    "category",
    "title",
    "description",
    "city",
    "state",
    "zip_code",
    "budget_min_cents",
    "budget_max_cents",
    "timing",
    "photos",
    "requirements",
    "spots_remaining",
  ] as const;
}

export const PRIVATE_PRE_CONNECTION_FIELDS = [
  "name",
  "first_name",
  "last_name",
  "phone",
  "email",
  "street",
  "street_line1",
  "street_line2",
  "exact_address",
  "lat",
  "lng",
  "website",
  "social",
  "qr",
] as const;

export function preConnectionPayloadLeaksPrivate(
  payload: Record<string, unknown> | null | undefined,
): boolean {
  if (!payload) return false;
  return PRIVATE_PRE_CONNECTION_FIELDS.some((key) => {
    const value = payload[key];
    return value != null && value !== "";
  });
}
