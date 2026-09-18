import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { CHARGES_LIVE, CONNECTION_FEE_CENTS, PAYMENTS_LIVE, SIGNUP_FEE_ENABLED } from "./types";
import {
  CONNECTION_CHECKOUT_CUSTOMER_ERROR,
  CONNECTION_RECONCILE_CUSTOMER_ERROR,
  FUNCTIONS_HTTP_ERROR_MESSAGE,
  STRIPE_ACTIVATION_PRICE_ID,
  STRIPE_CONNECTION_PRICE_ID,
  customerFacingConnectionCheckoutError,
  evaluateStripeSessionForFulfillment,
  fourthFinalizedConnectionAllowed,
  stopNewConnectionsRejectsCheckout,
} from "./connectionCheckout";
import {
  CONNECTED_BODY,
  contractorConnectionUiState,
  connectionAvailabilityCopy,
  remainingConnectionSpots,
  showConnectButton,
} from "./connectionLifecycle";
import {
  adminRevokeConnection,
  concurrentFinalSlotAttempts,
  contactVisibleFor,
  createHardeningLedger,
  expireStaleReservations,
  occupyingConnectionCount,
  paidSessionFor,
  remainingSpotsFromOccupancy,
  stopNewConnections,
  tryFulfill,
  tryReserve,
} from "./connectionMarketplaceHardening";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");

function allSql(): string {
  const dir = path.join(repoRoot, "supabase/migrations");
  return readdirSync(dir)
    .filter((name) => name.endsWith(".sql"))
    .sort()
    .map((name) => readFileSync(path.join(dir, name), "utf8"))
    .join("\n\n");
}

function functionBody(sql: string, name: string): string {
  const marker = `CREATE OR REPLACE FUNCTION public.${name}`;
  const start = sql.lastIndexOf(marker);
  expect(start).toBeGreaterThan(-1);
  const rest = sql.slice(start);
  const end = rest.indexOf("CREATE OR REPLACE FUNCTION public.", marker.length);
  return end === -1 ? rest : rest.slice(0, end);
}

function srcFile(rel: string): string {
  return readFileSync(path.join(repoRoot, rel), "utf8");
}

describe("Connection Marketplace staging hardening", () => {
  const sql = allSql();
  const expire = functionBody(sql, "expire_stale_connection_reservations");
  const occupancy = functionBody(sql, "project_connection_occupancy");
  const reserve = functionBody(sql, "reserve_connection_checkout");
  const fulfill = functionBody(sql, "fulfill_connection_fee_checkout");
  const stopNew = functionBody(sql, "stop_new_project_connections");
  const helper = functionBody(sql, "contractor_has_contact_access_on_project");
  const revoke = functionBody(sql, "admin_revoke_connection_contact_access");
  const grant = functionBody(sql, "grant_booking_contact_access_from_connection_fee");
  const recordEvent = functionBody(sql, "record_connection_checkout_event");
  const api = srcFile("src/lib/marketplace/api.ts");
  const detailPage = srcFile("src/pages/app/pro/ProMarketplacePages.tsx");
  const createCheckout = srcFile("supabase/functions/create-connection-checkout/index.ts");
  const t0 = new Date("2026-09-18T12:00:00.000Z");

  it("1. abandoned checkout occupies a temporary slot, then TTL release leaves no PAID or #14", () => {
    const ledger = createHardeningLedger();
    const reserved = tryReserve({
      ledger,
      projectId: "proj-1",
      contractorProfileId: "pro-1",
      now: t0,
    });
    expect(reserved.ok).toBe(true);
    if (!reserved.ok) return;
    expect(reserved.connection.status).toBe("RESERVED");
    expect(occupyingConnectionCount(ledger.connections, t0)).toBe(1);
    expect(remainingSpotsFromOccupancy(1)).toBe(2);
    expect(contactVisibleFor({ ledger, projectId: "proj-1", contractorProfileId: "pro-1" })).toBe(false);
    expect(ledger.entitlements).toHaveLength(0);
    expect(ledger.stripeCharges).toBe(0);

    const afterTtl = new Date(t0.getTime() + 30 * 60 * 1000 + 1);
    expect(occupyingConnectionCount(ledger.connections, afterTtl)).toBe(0);
    expect(expireStaleReservations(ledger, afterTtl)).toBe(1);
    expect(ledger.connections[0]?.status).toBe("EXPIRED");
    expect(ledger.slots).toHaveLength(0);
    expect(ledger.connections.some((row) => row.status === "PAID")).toBe(false);
    expect(contactVisibleFor({ ledger, projectId: "proj-1", contractorProfileId: "pro-1" })).toBe(false);

    expect(expire).toMatch(/status = 'EXPIRED'/);
    expect(expire).toMatch(/DELETE FROM public\.connection_slots WHERE connection_id/);
    expect(occupancy).toMatch(/c\.status = 'RESERVED'/);
    expect(occupancy).toMatch(/c\.reserved_until > now\(\)/);
    expect(reserve).toMatch(/make_interval\(secs => public\.connection_reservation_ttl_seconds\(\)\)/);
    expect(reserve).not.toMatch(/INSERT INTO public\.booking_contact_access/);
    expect(reserve).toMatch(/'RESERVED'/);
  });

  it("2. contractor with PAID/#14 cannot buy the same project again", () => {
    const ledger = createHardeningLedger();
    const first = tryReserve({ ledger, projectId: "proj-1", contractorProfileId: "pro-1", now: t0 });
    expect(first.ok).toBe(true);
    if (!first.ok) return;
    const paid = tryFulfill({
      ledger,
      connectionId: first.connection.id,
      processorEventId: "evt_paid_1",
      session: paidSessionFor(first.connection),
      stripePaid: true,
      now: t0,
    });
    expect(paid).toMatchObject({ ok: true, grant: true, paid: true });
    expect(ledger.entitlements).toHaveLength(1);
    expect(ledger.checkoutSessions).toHaveLength(1);
    expect(ledger.slots).toHaveLength(1);
    expect(ledger.stripeCharges).toBe(1);

    const again = tryReserve({ ledger, projectId: "proj-1", contractorProfileId: "pro-1", now: t0 });
    expect(again).toEqual({ ok: false, reason: "duplicate connection" });
    expect(ledger.checkoutSessions).toHaveLength(1);
    expect(ledger.slots).toHaveLength(1);
    expect(ledger.entitlements).toHaveLength(1);
    expect(ledger.stripeCharges).toBe(1);
    expect(ledger.connections.filter((row) => row.status === "PAID")).toHaveLength(1);

    const otherProject = tryReserve({ ledger, projectId: "proj-2", contractorProfileId: "pro-1", now: t0 });
    expect(otherProject.ok).toBe(true);

    expect(reserve).toMatch(/IF existing\.status IN \('PAID', 'COMPLETED', 'PAYMENT_DISABLED'\) THEN/);
    expect(reserve).toMatch(/RAISE EXCEPTION 'duplicate connection'/);
    expect(sql).toMatch(/CONSTRAINT project_connections_pair UNIQUE \(project_id, contractor_profile_id\)/);
  });

  it("3. final-slot concurrency allows at most one winner and never a 4th PAID", () => {
    const winners = concurrentFinalSlotAttempts([1, 2]);
    expect(winners.filter((slot) => slot != null)).toHaveLength(1);
    expect(winners[0]).toBe(3);
    expect(winners[1]).toBeNull();
    expect(fourthFinalizedConnectionAllowed(3)).toBe(false);

    const ledger = createHardeningLedger();
    expect(tryReserve({ ledger, projectId: "proj-1", contractorProfileId: "pro-a", now: t0 }).ok).toBe(true);
    expect(tryReserve({ ledger, projectId: "proj-1", contractorProfileId: "pro-b", now: t0 }).ok).toBe(true);
    const lastA = tryReserve({ ledger, projectId: "proj-1", contractorProfileId: "pro-c", now: t0 });
    const lastB = tryReserve({ ledger, projectId: "proj-1", contractorProfileId: "pro-d", now: t0 });
    expect(lastA.ok).toBe(true);
    expect(lastB.ok).toBe(false);
    if (!lastA.ok) return;
    expect(lastB).toEqual({ ok: false, reason: "connections full" });

    for (const conn of ledger.connections) {
      const result = tryFulfill({
        ledger,
        connectionId: conn.id,
        processorEventId: `evt_${conn.id}`,
        session: paidSessionFor(conn),
        stripePaid: true,
        now: t0,
      });
      expect(result.paid).toBe(true);
    }
    expect(ledger.connections.filter((row) => row.status === "PAID")).toHaveLength(3);
    expect(ledger.entitlements).toHaveLength(3);

    const late = createHardeningLedger();
    const ghost = tryReserve({ ledger: late, projectId: "proj-1", contractorProfileId: "pro-late", now: t0 });
    expect(ghost.ok).toBe(true);
    if (!ghost.ok) return;
    const afterGhostTtl = new Date(t0.getTime() + 31 * 60 * 1000);
    expireStaleReservations(late, afterGhostTtl);
    for (const contractor of ["pro-a", "pro-b", "pro-c"]) {
      const reserved = tryReserve({
        ledger: late,
        projectId: "proj-1",
        contractorProfileId: contractor,
        now: afterGhostTtl,
      });
      expect(reserved.ok).toBe(true);
      if (!reserved.ok) return;
      expect(
        tryFulfill({
          ledger: late,
          connectionId: reserved.connection.id,
          processorEventId: `evt_${contractor}`,
          session: paidSessionFor(reserved.connection),
          stripePaid: true,
          now: afterGhostTtl,
        }).paid,
      ).toBe(true);
    }
    const afterExpire = tryFulfill({
      ledger: late,
      connectionId: ghost.connection.id,
      processorEventId: "evt_late_pay",
      session: paidSessionFor(ghost.connection),
      stripePaid: true,
      now: afterGhostTtl,
    });
    expect(afterExpire).toMatchObject({
      grant: false,
      paid: false,
      needsRefund: true,
      reason: "paid_but_reservation_not_active",
    });
    expect(late.connections.find((row) => row.id === ghost.connection.id)?.status).not.toBe("PAID");
    expect(contactVisibleFor({ ledger: late, projectId: "proj-1", contractorProfileId: "pro-late" })).toBe(false);
    expect(late.connections.filter((row) => row.status === "PAID").length).toBeLessThanOrEqual(3);

    expect(reserve).toMatch(/IF occupied >= 3 THEN/);
    expect(reserve).toMatch(/EXCEPTION WHEN unique_violation THEN/);
    expect(reserve).toMatch(/SELECT \* INTO proj FROM public\.projects WHERE id = p_project_id FOR UPDATE/);
    expect(sql).toMatch(/CONSTRAINT connection_slots_range CHECK \(slot_number BETWEEN 1 AND 3\)/);
    expect(fulfill).toMatch(/paid_but_reservation_not_active/);
    expect(fulfill).toMatch(/contact_unlocked', false/);
    expect(fulfill).toMatch(/needs_refund', true/);
    expect(fulfill.indexOf("paid_but_reservation_not_active")).toBeLessThan(
      fulfill.indexOf("grant_booking_contact_access_from_connection_fee"),
    );
  });

  it("4. Stop New Connections blocks new reserves; in-flight RESERVED may still finalize; existing PAID/#14 stay", () => {
    const ledger = createHardeningLedger();
    const paidReserve = tryReserve({ ledger, projectId: "proj-1", contractorProfileId: "pro-paid", now: t0 });
    expect(paidReserve.ok).toBe(true);
    if (!paidReserve.ok) return;
    expect(
      tryFulfill({
        ledger,
        connectionId: paidReserve.connection.id,
        processorEventId: "evt_existing_paid",
        session: paidSessionFor(paidReserve.connection),
        stripePaid: true,
        now: t0,
      }).paid,
    ).toBe(true);
    const inflight = tryReserve({ ledger, projectId: "proj-1", contractorProfileId: "pro-flight", now: t0 });
    expect(inflight.ok).toBe(true);
    if (!inflight.ok) return;

    const stopped = stopNewConnections(ledger);
    expect(stopped.accepting).toBe(false);
    expect(stopped.unlockedKept).toBe(1);
    expect(stopNewConnectionsRejectsCheckout(false, true)).toEqual({
      rejectNew: true,
      allowInFlightFinalize: true,
    });

    const blocked = tryReserve({ ledger, projectId: "proj-1", contractorProfileId: "pro-new", now: t0 });
    expect(blocked).toEqual({ ok: false, reason: "customer stopped new connections" });

    const finalized = tryFulfill({
      ledger,
      connectionId: inflight.connection.id,
      processorEventId: "evt_inflight",
      session: paidSessionFor(inflight.connection),
      stripePaid: true,
      now: t0,
    });
    expect(finalized).toMatchObject({ ok: true, grant: true, paid: true, needsRefund: false });
    expect(contactVisibleFor({ ledger, projectId: "proj-1", contractorProfileId: "pro-paid" })).toBe(true);
    expect(contactVisibleFor({ ledger, projectId: "proj-1", contractorProfileId: "pro-flight" })).toBe(true);

    expect(reserve).toMatch(/customer stopped new connections/);
    expect(fulfill).not.toMatch(/accepting_connections/);
    expect(stopNew).toMatch(/accepting_connections = false/);
    expect(stopNew).toMatch(/existing_unlocked_kept/);
    expect(stopNew).toMatch(/'deleted', false/);
  });

  it("5. client cannot change amount, currency, Price, contractor, project, slots, or paid", () => {
    const ledger = createHardeningLedger();
    const reserved = tryReserve({ ledger, projectId: "proj-1", contractorProfileId: "pro-1", now: t0 });
    expect(reserved.ok).toBe(true);
    if (!reserved.ok) return;
    const base = paidSessionFor(reserved.connection);

    expect(
      evaluateStripeSessionForFulfillment({
        session: { ...base, amount_total: 1 },
        expectedConnectionId: reserved.connection.id,
        expectedProjectId: "proj-1",
        expectedContractorProfileId: "pro-1",
        reservationActive: true,
        hasSlot: true,
      }),
    ).toMatchObject({ grant: false, reason: "wrong_amount", needsRefund: true });
    expect(
      evaluateStripeSessionForFulfillment({
        session: { ...base, currency: "eur" },
        expectedConnectionId: reserved.connection.id,
        expectedProjectId: "proj-1",
        expectedContractorProfileId: "pro-1",
        reservationActive: true,
        hasSlot: true,
      }),
    ).toMatchObject({ grant: false, reason: "wrong_currency", needsRefund: true });
    expect(
      evaluateStripeSessionForFulfillment({
        session: {
          ...base,
          line_items: { data: [{ price: { id: STRIPE_ACTIVATION_PRICE_ID, unit_amount: 499, currency: "usd" } }] },
        },
        expectedConnectionId: reserved.connection.id,
        expectedProjectId: "proj-1",
        expectedContractorProfileId: "pro-1",
        reservationActive: true,
        hasSlot: true,
      }),
    ).toMatchObject({ grant: false, reason: "wrong_price_id", needsRefund: true });
    expect(
      evaluateStripeSessionForFulfillment({
        session: { ...base, metadata: { ...base.metadata, contractor_profile_id: "pro-other" } },
        expectedConnectionId: reserved.connection.id,
        expectedProjectId: "proj-1",
        expectedContractorProfileId: "pro-1",
        reservationActive: true,
        hasSlot: true,
      }).reason,
    ).toBe("mismatched_metadata");
    expect(
      evaluateStripeSessionForFulfillment({
        session: { ...base, metadata: { ...base.metadata, project_id: "proj-other" } },
        expectedConnectionId: reserved.connection.id,
        expectedProjectId: "proj-1",
        expectedContractorProfileId: "pro-1",
        reservationActive: true,
        hasSlot: true,
      }).reason,
    ).toBe("mismatched_metadata");

    const wrongAmount = tryFulfill({
      ledger,
      connectionId: reserved.connection.id,
      processorEventId: "evt_tamper_amount",
      session: { ...base, amount_total: 1999 },
      stripePaid: true,
      now: t0,
    });
    expect(wrongAmount.grant).toBe(false);
    expect(wrongAmount.paid).toBe(false);
    expect(contactVisibleFor({ ledger, projectId: "proj-1", contractorProfileId: "pro-1" })).toBe(false);

    expect(createCheckout).toMatch(/client cannot set price, amount, or contractor/);
    expect(createCheckout).toMatch(/body\.price_id \|\| body\.amount_cents != null \|\| body\.contractor_profile_id/);
    expect(fulfill).toMatch(/connection fee is server-authoritative and must be 499 cents/);
    expect(fulfill).toMatch(/connection fee currency must be usd/);
    expect(fulfill).toMatch(/wrong connection Price ID/);
    expect(fulfill).toMatch(/mismatched metadata/);
    expect(sql).toMatch(/CONSTRAINT project_connections_fee_cents_check CHECK \(fee_cents = 499\)/);
    expect(STRIPE_CONNECTION_PRICE_ID).toBe("price_1UH1RsPYJQAIQDv721IhjKS0");
    expect(CONNECTION_FEE_CENTS).toBe(499);
  });

  it("6. repeated signed webhook and reconcile cannot duplicate connection, entitlement, slot, or billing", () => {
    const ledger = createHardeningLedger();
    const reserved = tryReserve({ ledger, projectId: "proj-1", contractorProfileId: "pro-1", now: t0 });
    expect(reserved.ok).toBe(true);
    if (!reserved.ok) return;
    const session = paidSessionFor(reserved.connection);
    const first = tryFulfill({
      ledger,
      connectionId: reserved.connection.id,
      processorEventId: "evt_abc",
      session,
      stripePaid: true,
      now: t0,
    });
    const webhookReplay = tryFulfill({
      ledger,
      connectionId: reserved.connection.id,
      processorEventId: "evt_abc",
      session,
      stripePaid: true,
      now: t0,
    });
    const reconcileReplay = tryFulfill({
      ledger,
      connectionId: reserved.connection.id,
      processorEventId: `reconcile:${reserved.connection.stripeSessionId}`,
      session,
      stripePaid: true,
      now: t0,
    });
    expect(first).toMatchObject({ grant: true, paid: true, idempotent: false });
    expect(webhookReplay).toMatchObject({ paid: true, grant: false, idempotent: true, duplicateEvent: true });
    expect(reconcileReplay).toMatchObject({ paid: true, grant: false, idempotent: true, duplicateEvent: false });
    expect(ledger.connections.filter((row) => row.status === "PAID")).toHaveLength(1);
    expect(ledger.entitlements).toHaveLength(1);
    expect(ledger.slots).toHaveLength(1);
    expect(ledger.checkoutSessions).toHaveLength(1);
    expect(ledger.stripeCharges).toBe(1);
    expect(ledger.processorEventIds).toEqual(["evt_abc", `reconcile:${reserved.connection.stripeSessionId}`]);

    expect(sql).toMatch(/processor_event_id text NOT NULL UNIQUE/);
    expect(recordEvent).toMatch(/'duplicate', true/);
    expect(fulfill).toMatch(/IF conn\.status IN \('PAID', 'COMPLETED'\) THEN/);
    expect(fulfill).toMatch(/'idempotent', true/);
    expect(grant).toMatch(/ON CONFLICT \(connection_id\) DO UPDATE/);
  });

  it("7. unpaid cannot read private contact; paid is project-scoped; #14 revoke still works", () => {
    const ledger = createHardeningLedger();
    const unpaid = tryReserve({ ledger, projectId: "proj-1", contractorProfileId: "pro-1", now: t0 });
    expect(unpaid.ok).toBe(true);
    const paidReserve = tryReserve({ ledger, projectId: "proj-1", contractorProfileId: "pro-2", now: t0 });
    expect(paidReserve.ok).toBe(true);
    if (!unpaid.ok || !paidReserve.ok) return;
    expect(
      tryFulfill({
        ledger,
        connectionId: paidReserve.connection.id,
        processorEventId: "evt_pro2",
        session: paidSessionFor(paidReserve.connection),
        stripePaid: true,
        now: t0,
      }).grant,
    ).toBe(true);

    expect(contactVisibleFor({ ledger, projectId: "proj-1", contractorProfileId: "pro-1" })).toBe(false);
    expect(contactVisibleFor({ ledger, projectId: "proj-1", contractorProfileId: "pro-2" })).toBe(true);
    expect(contactVisibleFor({ ledger, projectId: "proj-2", contractorProfileId: "pro-2" })).toBe(false);

    expect(adminRevokeConnection(ledger, paidReserve.connection.id)).toBe(true);
    expect(contactVisibleFor({ ledger, projectId: "proj-1", contractorProfileId: "pro-2" })).toBe(false);

    expect(helper).toMatch(/FROM public\.booking_contact_access a/);
    expect(helper).toMatch(/a\.project_id = p_project_id/);
    expect(helper).toMatch(/a\.contractor_profile_id = public\.current_contractor_profile_id\(\)/);
    expect(helper).not.toMatch(/FROM public\.project_connections/);
    expect(helper).toMatch(/a\.status IN \('UNLOCKED', 'ADMIN_OVERRIDE'\)/);
    expect(helper).toMatch(/a\.revoked_at IS NULL/);
    expect(revoke).toMatch(/status = 'LOCKED'/);
    expect(revoke).toMatch(/revoked_at = now\(\)/);
    expect(grant).toMatch(/CONNECTION_FEE_PAYMENT/);
  });

  it("8. UX hides raw Edge/non-2xx strings; connection counts and Connect/Checkout/Connected states are wired", async () => {
    expect(api).toMatch(/customerFacingConnectionCheckoutError\(data, error\)/);
    expect(api).toMatch(/CONNECTION_RECONCILE_CUSTOMER_ERROR/);
    expect(api).not.toMatch(/asError\(error, "Could not start Connection Fee checkout\."\)/);
    expect(api).not.toMatch(/throw new Error\(asError\(error, "Could not reconcile/);
    await expect(
      customerFacingConnectionCheckoutError(null, { message: FUNCTIONS_HTTP_ERROR_MESSAGE }),
    ).resolves.toBe(CONNECTION_CHECKOUT_CUSTOMER_ERROR);
    await expect(
      customerFacingConnectionCheckoutError(null, { message: FUNCTIONS_HTTP_ERROR_MESSAGE }, CONNECTION_RECONCILE_CUSTOMER_ERROR),
    ).resolves.toBe(CONNECTION_RECONCILE_CUSTOMER_ERROR);

    expect(remainingConnectionSpots(["PAID", "PAID"])).toBe(1);
    expect(connectionAvailabilityCopy(2)).toBe("2 of 3 remaining");
    expect(connectionAvailabilityCopy(0)).toBe("Connections Full");
    expect(occupyingConnectionCount([{ status: "RESERVED", reservedUntil: "2026-09-18T11:00:00.000Z" }], t0)).toBe(0);
    expect(occupyingConnectionCount([{ status: "RESERVED", reservedUntil: "2026-09-18T13:00:00.000Z" }], t0)).toBe(1);

    expect(contractorConnectionUiState({ myConnectionStatus: "PAID" })).toBe("connected");
    expect(contractorConnectionUiState({ myConnectionStatus: "RESERVED", reservedUntil: "2026-09-18T13:00:00Z", now: t0 })).toBe(
      "checkout_pending",
    );
    expect(contractorConnectionUiState({ remaining: 0 })).toBe("full");
    expect(contractorConnectionUiState({ accepting: false })).toBe("closed");
    expect(contractorConnectionUiState({ myConnectionStatus: "PAYMENT_DISABLED" })).toBe("requested");
    expect(contractorConnectionUiState({})).toBe("connect");
    expect(showConnectButton("connect")).toBe(true);
    expect(showConnectButton("checkout_pending")).toBe(true);
    expect(showConnectButton("connected")).toBe(false);
    expect(showConnectButton("full")).toBe(false);

    expect(detailPage).toMatch(/fetchMyProjectConnections/);
    expect(detailPage).toMatch(/contractorConnectionUiState/);
    expect(detailPage).toMatch(/ContractorConnectionCta/);
    const cta = srcFile("src/components/marketplace/ContractorConnectionCta.tsx");
    expect(cta).toContain("CONNECTED_LABEL");
    expect(cta).toContain("CONNECT_BUTTON_LABEL");
    expect(cta).toContain("CHECKOUT_PENDING_COPY");
    expect(CONNECTED_BODY).toMatch(/this project only/i);

    expect(PAYMENTS_LIVE).toBe(false);
    expect(CHARGES_LIVE).toBe(false);
    expect(SIGNUP_FEE_ENABLED).toBe(false);
  });
});
