/**
 * In-memory Connection Marketplace adversarial/lifecycle model.
 * Mirrors reserve / expire / fulfill / stop-new / #14 grant rules for automated tests.
 * Does not talk to Stripe or mutate staging/production.
 */

import { claimSlotExclusive } from "./slots";
import {
  CONNECTION_FEE_CENTS,
  MAX_COMPLETED_CONNECTIONS,
  type ContactAccessStatus,
  type ProjectConnectionStatus,
} from "./types";
import {
  CONNECTION_CHECKOUT_KIND,
  CONNECTION_FEE_CURRENCY,
  CONNECTION_RESERVATION_TTL_SECONDS,
  STRIPE_CONNECTION_PRICE_ID,
  evaluateStripeSessionForFulfillment,
  reservationOccupiesSlot,
  type CheckoutSessionLike,
} from "./connectionCheckout";
import { connectionEntitlementAllowsReveal } from "./connectionLifecycle";

export { CONNECTION_RESERVATION_TTL_SECONDS };

export type HardeningConnection = {
  id: string;
  projectId: string;
  contractorProfileId: string;
  status: ProjectConnectionStatus;
  reservedUntil: string | null;
  slot: number | null;
  stripeSessionId: string | null;
  needsRefund: boolean;
  refundReason: string | null;
};

export type HardeningEntitlement = {
  connectionId: string;
  projectId: string;
  contractorProfileId: string;
  status: ContactAccessStatus;
  revokedAt: string | null;
};

export type HardeningLedger = {
  accepting: boolean;
  connections: HardeningConnection[];
  slots: Array<{ projectId: string; slot: number; connectionId: string }>;
  entitlements: HardeningEntitlement[];
  processorEventIds: string[];
  checkoutSessions: string[];
  stripeCharges: number;
  nextId: number;
};

export type ReserveResult =
  | { ok: true; connection: HardeningConnection; idempotent: boolean; createdSession: boolean }
  | { ok: false; reason: string };

export type FulfillResult = {
  ok: boolean;
  grant: boolean;
  paid: boolean;
  idempotent: boolean;
  needsRefund: boolean;
  reason: string;
  duplicateEvent: boolean;
};

export function createHardeningLedger(accepting = true): HardeningLedger {
  return {
    accepting,
    connections: [],
    slots: [],
    entitlements: [],
    processorEventIds: [],
    checkoutSessions: [],
    stripeCharges: 0,
    nextId: 1,
  };
}

export function occupyingConnectionCount(
  rows: Array<{ status: ProjectConnectionStatus; reservedUntil?: string | Date | null }>,
  now = new Date(),
): number {
  return rows.filter((row) => reservationOccupiesSlot(row.status, row.reservedUntil ?? null, now)).length;
}

export function remainingSpotsFromOccupancy(occupied: number, max = MAX_COMPLETED_CONNECTIONS): number {
  return Math.max(0, max - occupied);
}

export function expireStaleReservations(ledger: HardeningLedger, now = new Date()): number {
  let released = 0;
  for (const conn of ledger.connections) {
    if (conn.status !== "RESERVED" || !conn.reservedUntil) continue;
    if (new Date(conn.reservedUntil).getTime() >= now.getTime()) continue;
    ledger.slots = ledger.slots.filter((slot) => slot.connectionId !== conn.id);
    conn.status = "EXPIRED";
    conn.slot = null;
    released += 1;
  }
  return released;
}

function takenSlots(ledger: HardeningLedger, projectId: string): Set<number> {
  return new Set(ledger.slots.filter((slot) => slot.projectId === projectId).map((slot) => slot.slot));
}

function existingPair(ledger: HardeningLedger, projectId: string, contractorProfileId: string) {
  return ledger.connections.find(
    (row) => row.projectId === projectId && row.contractorProfileId === contractorProfileId,
  );
}

export function tryReserve(input: {
  ledger: HardeningLedger;
  projectId: string;
  contractorProfileId: string;
  now?: Date;
  ttlSeconds?: number;
}): ReserveResult {
  const now = input.now ?? new Date();
  expireStaleReservations(input.ledger, now);
  if (!input.ledger.accepting) return { ok: false, reason: "customer stopped new connections" };

  const existing = existingPair(input.ledger, input.projectId, input.contractorProfileId);
  if (existing?.status === "PAID" || existing?.status === "COMPLETED" || existing?.status === "PAYMENT_DISABLED") {
    return { ok: false, reason: "duplicate connection" };
  }
  if (
    existing?.status === "RESERVED" &&
    reservationOccupiesSlot(existing.status, existing.reservedUntil, now)
  ) {
    return { ok: true, connection: existing, idempotent: true, createdSession: false };
  }

  const occupied = occupyingConnectionCount(
    input.ledger.connections.filter((row) => row.projectId === input.projectId),
    now,
  );
  if (occupied >= MAX_COMPLETED_CONNECTIONS) return { ok: false, reason: "connections full" };

  const slot = claimSlotExclusive(takenSlots(input.ledger, input.projectId), MAX_COMPLETED_CONNECTIONS);
  if (slot == null) return { ok: false, reason: "connections full" };

  const ttlMs = (input.ttlSeconds ?? CONNECTION_RESERVATION_TTL_SECONDS) * 1000;
  const reservedUntil = new Date(now.getTime() + ttlMs).toISOString();
  const sessionId = `cs_test_${input.ledger.nextId}`;
  if (existing && (existing.status === "EXPIRED" || existing.status === "FAILED" || existing.status === "CANCELLED")) {
    existing.status = "RESERVED";
    existing.slot = slot;
    existing.reservedUntil = reservedUntil;
    existing.stripeSessionId = sessionId;
    existing.needsRefund = false;
    existing.refundReason = null;
    input.ledger.slots.push({ projectId: input.projectId, slot, connectionId: existing.id });
    input.ledger.checkoutSessions.push(sessionId);
    input.ledger.nextId += 1;
    return { ok: true, connection: existing, idempotent: false, createdSession: true };
  }

  const connection: HardeningConnection = {
    id: `conn-${input.ledger.nextId}`,
    projectId: input.projectId,
    contractorProfileId: input.contractorProfileId,
    status: "RESERVED",
    reservedUntil,
    slot,
    stripeSessionId: sessionId,
    needsRefund: false,
    refundReason: null,
  };
  input.ledger.nextId += 1;
  input.ledger.connections.push(connection);
  input.ledger.slots.push({ projectId: input.projectId, slot, connectionId: connection.id });
  input.ledger.checkoutSessions.push(sessionId);
  return { ok: true, connection, idempotent: false, createdSession: true };
}

export function recordProcessorEvent(ledger: HardeningLedger, eventId: string): { duplicate: boolean } {
  if (ledger.processorEventIds.includes(eventId)) return { duplicate: true };
  ledger.processorEventIds.push(eventId);
  return { duplicate: false };
}

export function tryFulfill(input: {
  ledger: HardeningLedger;
  connectionId: string;
  processorEventId: string;
  session: CheckoutSessionLike;
  stripePaid: boolean;
  now?: Date;
}): FulfillResult {
  const now = input.now ?? new Date();
  const duplicateEvent = recordProcessorEvent(input.ledger, input.processorEventId).duplicate;
  const conn = input.ledger.connections.find((row) => row.id === input.connectionId);
  if (!conn) {
    return {
      ok: false,
      grant: false,
      paid: false,
      idempotent: false,
      needsRefund: false,
      reason: "connection not found",
      duplicateEvent,
    };
  }

  const decision = evaluateStripeSessionForFulfillment({
    session: input.session,
    expectedConnectionId: conn.id,
    expectedProjectId: conn.projectId,
    expectedContractorProfileId: conn.contractorProfileId,
    reservationActive: reservationOccupiesSlot(conn.status, conn.reservedUntil, now) && conn.status === "RESERVED",
    hasSlot: input.ledger.slots.some((slot) => slot.connectionId === conn.id),
    occupiedAfterExpire: occupyingConnectionCount(
      input.ledger.connections.filter((row) => row.projectId === conn.projectId),
      now,
    ),
    stripeTestMode: true,
    connectionFeeCheckoutEnabled: true,
  });

  if (conn.status === "PAID" || conn.status === "COMPLETED") {
    return {
      ok: true,
      grant: false,
      paid: true,
      idempotent: true,
      needsRefund: false,
      reason: "already_fulfilled",
      duplicateEvent,
    };
  }

  if (!input.stripePaid || decision.reason === "unpaid") {
    return {
      ok: false,
      grant: false,
      paid: false,
      idempotent: false,
      needsRefund: false,
      reason: "unpaid",
      duplicateEvent,
    };
  }

  if (!decision.ok) {
    const reservationGone =
      decision.reason === "reservation_not_active" || decision.reason === "connections_full";
    const reason = reservationGone ? "paid_but_reservation_not_active" : decision.reason;
    const needsRefund = Boolean(decision.needsRefund) || reservationGone;
    if (needsRefund) {
      conn.needsRefund = true;
      conn.refundReason = reason;
      input.ledger.stripeCharges += 1;
    }
    return {
      ok: false,
      grant: false,
      paid: false,
      idempotent: false,
      needsRefund,
      reason,
      duplicateEvent,
    };
  }

  const slotPresent = input.ledger.slots.some((slot) => slot.connectionId === conn.id);
  const reservationActive = conn.status === "RESERVED" && reservationOccupiesSlot(conn.status, conn.reservedUntil, now);
  if (!reservationActive || !slotPresent) {
    conn.needsRefund = true;
    conn.refundReason = "paid_but_reservation_not_active";
    input.ledger.stripeCharges += 1;
    return {
      ok: false,
      grant: false,
      paid: false,
      idempotent: false,
      needsRefund: true,
      reason: "paid_but_reservation_not_active",
      duplicateEvent,
    };
  }

  conn.status = "PAID";
  conn.needsRefund = false;
  conn.refundReason = null;
  input.ledger.stripeCharges += 1;
  const existingEntitlement = input.ledger.entitlements.find((row) => row.connectionId === conn.id);
  if (!existingEntitlement) {
    input.ledger.entitlements.push({
      connectionId: conn.id,
      projectId: conn.projectId,
      contractorProfileId: conn.contractorProfileId,
      status: "UNLOCKED",
      revokedAt: null,
    });
  } else if (!existingEntitlement.revokedAt) {
    existingEntitlement.status = existingEntitlement.status === "ADMIN_OVERRIDE" ? "ADMIN_OVERRIDE" : "UNLOCKED";
  }
  return {
    ok: true,
    grant: true,
    paid: true,
    idempotent: false,
    needsRefund: false,
    reason: "paid_valid_session",
    duplicateEvent,
  };
}

export function stopNewConnections(ledger: HardeningLedger): { accepting: boolean; unlockedKept: number } {
  ledger.accepting = false;
  return {
    accepting: false,
    unlockedKept: ledger.entitlements.filter((row) => !row.revokedAt && (row.status === "UNLOCKED" || row.status === "ADMIN_OVERRIDE"))
      .length,
  };
}

export function adminRevokeConnection(ledger: HardeningLedger, connectionId: string): boolean {
  const row = ledger.entitlements.find((item) => item.connectionId === connectionId);
  if (!row) return false;
  row.status = "LOCKED";
  row.revokedAt = new Date().toISOString();
  return true;
}

export function contactVisibleFor(input: {
  ledger: HardeningLedger;
  projectId: string;
  contractorProfileId: string;
}): boolean {
  return input.ledger.entitlements.some(
    (row) =>
      row.projectId === input.projectId &&
      row.contractorProfileId === input.contractorProfileId &&
      connectionEntitlementAllowsReveal({ status: row.status, revoked_at: row.revokedAt }),
  );
}

export function paidSessionFor(connection: HardeningConnection, overrides: Partial<CheckoutSessionLike> = {}): CheckoutSessionLike {
  return {
    id: connection.stripeSessionId ?? "cs_test_valid",
    livemode: false,
    mode: "payment",
    payment_status: "paid",
    currency: CONNECTION_FEE_CURRENCY,
    amount_total: CONNECTION_FEE_CENTS,
    client_reference_id: connection.id,
    metadata: {
      ppp_kind: CONNECTION_CHECKOUT_KIND,
      connection_id: connection.id,
      project_id: connection.projectId,
      contractor_profile_id: connection.contractorProfileId,
    },
    payment_intent: "pi_test_paid_12345",
    line_items: {
      data: [{ price: { id: STRIPE_CONNECTION_PRICE_ID, unit_amount: CONNECTION_FEE_CENTS, currency: CONNECTION_FEE_CURRENCY }, amount_total: CONNECTION_FEE_CENTS }],
    },
    ...overrides,
  };
}

export function concurrentFinalSlotAttempts(occupiedSlots: number[]): Array<number | null> {
  const taken = new Set(occupiedSlots);
  return [claimSlotExclusive(taken), claimSlotExclusive(taken), claimSlotExclusive(taken)];
}
