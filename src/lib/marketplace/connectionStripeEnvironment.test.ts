import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  CONNECTION_CHECKOUT_KIND,
  STRIPE_ACTIVATION_PRICE_ID,
  STRIPE_CONNECTION_PRICE_ID,
  evaluateStripeSessionForFulfillment,
  fourthFinalizedConnectionAllowed,
  successUrlUnlocksContact,
  trustedFulfillmentPathOnly,
} from "./connectionCheckout";
import {
  concurrentFinalSlotAttempts,
  createHardeningLedger,
  paidSessionFor,
  tryFulfill,
  tryReserve,
} from "./connectionMarketplaceHardening";
import {
  assertConnectionPriceMatchesMode,
  livemodeMismatchReason,
  requireConnectionPriceId,
  requireStripeSecretForMode,
  stripeTestModeFromSetting,
} from "./stripeEnvironment";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const LIVE_PRICE_ID = "price_live_connection_fee_499";
const TEST_SECRET = "sk_test_1234567890abcd";
const LIVE_SECRET = "sk_live_1234567890abcd";

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

function walk(dir: string, acc: string[] = []): string[] {
  for (const name of readdirSync(dir, { withFileTypes: true })) {
    const next = path.join(dir, name.name);
    if (name.isDirectory()) walk(next, acc);
    else acc.push(next);
  }
  return acc;
}

function functionsSource(): string {
  return walk(path.join(repoRoot, "supabase/functions"))
    .filter((file) => file.endsWith(".ts"))
    .map((file) => readFileSync(file, "utf8"))
    .join("\n");
}

const paidTestSession = {
  id: "cs_test_valid",
  livemode: false,
  mode: "payment" as const,
  payment_status: "paid",
  currency: "usd",
  amount_total: 499,
  client_reference_id: "conn-1",
  metadata: {
    ppp_kind: CONNECTION_CHECKOUT_KIND,
    connection_id: "conn-1",
    project_id: "proj-1",
    contractor_profile_id: "pro-1",
  },
  payment_intent: "pi_test_paid_123",
  line_items: {
    data: [{ price: { id: STRIPE_CONNECTION_PRICE_ID, unit_amount: 499, currency: "usd" }, amount_total: 499 }],
  },
};

const paidLiveSession = {
  ...paidTestSession,
  id: "cs_live_valid",
  livemode: true,
  line_items: {
    data: [{ price: { id: LIVE_PRICE_ID, unit_amount: 499, currency: "usd" }, amount_total: 499 }],
  },
};

describe("Connection Fee Stripe TEST/LIVE environment control", () => {
  const sql = allSql();
  const fn = functionsSource();
  const fulfill = functionBody(sql, "fulfill_connection_fee_checkout");
  const reserve = functionBody(sql, "reserve_connection_checkout");
  const attach = functionBody(sql, "attach_connection_checkout_session");
  const assertEnv = functionBody(sql, "assert_connection_stripe_environment");
  const grant = functionBody(sql, "grant_booking_contact_access_from_connection_fee");
  const helper = functionBody(sql, "contractor_has_contact_access_on_project");
  const config = readFileSync(path.join(repoRoot, "supabase/config.toml"), "utf8");
  const t0 = new Date("2026-09-18T12:00:00.000Z");

  it("1. test mode + sk_test_ accepted", () => {
    expect(stripeTestModeFromSetting(1)).toBe(true);
    expect(requireStripeSecretForMode(TEST_SECRET, true)).toBe(TEST_SECRET);
    expect(
      evaluateStripeSessionForFulfillment({
        session: paidTestSession,
        expectedConnectionId: "conn-1",
        expectedProjectId: "proj-1",
        expectedContractorProfileId: "pro-1",
        reservationActive: true,
        hasSlot: true,
        stripeTestMode: true,
        expectedPriceId: STRIPE_CONNECTION_PRICE_ID,
        connectionFeeCheckoutEnabled: true,
      }),
    ).toEqual({ ok: true, grant: true, reason: "paid_valid_session" });
    expect(fn).toMatch(/requireSecretForMode/);
    expect(assertEnv).toMatch(/stripe_test_mode=1 requires a Stripe TEST checkout session \(cs_test_\)/);
  });

  it("2. test mode + sk_live_ rejected", () => {
    expect(() => requireStripeSecretForMode(LIVE_SECRET, true)).toThrow(/Live keys are forbidden/);
    expect(livemodeMismatchReason(true, true)).toBe("live_mode_forbidden");
    expect(fn).toMatch(/Live keys are forbidden/);
    expect(assertEnv).toMatch(/live Stripe events are forbidden while stripe_test_mode=1/);
  });

  it("3. live mode + sk_live_ accepted", () => {
    expect(stripeTestModeFromSetting(0)).toBe(false);
    expect(requireStripeSecretForMode(LIVE_SECRET, false)).toBe(LIVE_SECRET);
    expect(
      evaluateStripeSessionForFulfillment({
        session: paidLiveSession,
        expectedConnectionId: "conn-1",
        expectedProjectId: "proj-1",
        expectedContractorProfileId: "pro-1",
        reservationActive: true,
        hasSlot: true,
        stripeTestMode: false,
        expectedPriceId: LIVE_PRICE_ID,
        connectionFeeCheckoutEnabled: true,
      }),
    ).toEqual({ ok: true, grant: true, reason: "paid_valid_session" });
    expect(assertEnv).toMatch(/stripe_test_mode=0 requires a Stripe LIVE checkout session \(cs_live_\)/);
    expect(fulfill).toMatch(/assert_connection_stripe_environment/);
    expect(reserve).not.toMatch(/stripe_test_mode must stay 1/);
  });

  it("4. live mode + sk_test_ rejected", () => {
    expect(() => requireStripeSecretForMode(TEST_SECRET, false)).toThrow(/Test keys are forbidden/);
    expect(livemodeMismatchReason(false, false)).toBe("test_mode_forbidden");
    expect(fn).toMatch(/Test keys are forbidden/);
    expect(assertEnv).toMatch(/test Stripe events are forbidden while stripe_test_mode=0/);
  });

  it("5. test mode rejects event.livemode=true", () => {
    expect(
      evaluateStripeSessionForFulfillment({
        session: { ...paidTestSession, livemode: true },
        expectedConnectionId: "conn-1",
        expectedProjectId: "proj-1",
        expectedContractorProfileId: "pro-1",
        reservationActive: true,
        hasSlot: true,
        stripeTestMode: true,
        expectedPriceId: STRIPE_CONNECTION_PRICE_ID,
      }).reason,
    ).toBe("live_mode_forbidden");
    expect(assertConnectionPriceMatchesMode(
      { id: STRIPE_CONNECTION_PRICE_ID, livemode: true, currency: "usd", unit_amount: 499, type: "one_time" },
      { expectedPriceId: STRIPE_CONNECTION_PRICE_ID, testMode: true },
    )).toEqual({ ok: false, reason: "price_livemode_mismatch" });
    expect(fn).toMatch(/livemodeMatchesStripeTestMode/);
    expect(fn).toMatch(/livemodeMismatchMessage/);
  });

  it("6. live mode rejects event.livemode=false", () => {
    expect(
      evaluateStripeSessionForFulfillment({
        session: { ...paidLiveSession, livemode: false },
        expectedConnectionId: "conn-1",
        expectedProjectId: "proj-1",
        expectedContractorProfileId: "pro-1",
        reservationActive: true,
        hasSlot: true,
        stripeTestMode: false,
        expectedPriceId: LIVE_PRICE_ID,
      }).reason,
    ).toBe("test_mode_forbidden");
    expect(assertConnectionPriceMatchesMode(
      { id: LIVE_PRICE_ID, livemode: false, currency: "usd", unit_amount: 499, type: "one_time" },
      { expectedPriceId: LIVE_PRICE_ID, testMode: false },
    )).toEqual({ ok: false, reason: "price_livemode_mismatch" });
    expect(attach).toMatch(/assert_connection_stripe_environment/);
  });

  it("7. missing Price ID fails closed", () => {
    expect(() => requireConnectionPriceId("")).toThrow(/STRIPE_CONNECTION_PRICE_ID is required/);
    expect(() => requireConnectionPriceId(undefined)).toThrow(/STRIPE_CONNECTION_PRICE_ID is required/);
    expect(
      evaluateStripeSessionForFulfillment({
        session: { ...paidLiveSession, line_items: { data: [] } },
        expectedConnectionId: "conn-1",
        expectedProjectId: "proj-1",
        expectedContractorProfileId: "pro-1",
        reservationActive: true,
        hasSlot: true,
        stripeTestMode: false,
        expectedPriceId: LIVE_PRICE_ID,
      }).reason,
    ).toBe("missing_price_id");
    expect(
      evaluateStripeSessionForFulfillment({
        session: paidLiveSession,
        expectedConnectionId: "conn-1",
        expectedProjectId: "proj-1",
        expectedContractorProfileId: "pro-1",
        reservationActive: true,
        hasSlot: true,
        stripeTestMode: false,
        expectedPriceId: "",
      }).reason,
    ).toBe("missing_price_id");
    expect(fn).toMatch(/requireConnectionPriceId/);
    expect(fn).not.toMatch(/connectionPriceId\(\)/);
    expect(attach).toMatch(/STRIPE_CONNECTION_PRICE_ID is required/);
  });

  it("8. wrong Price ID fails closed", () => {
    expect(
      evaluateStripeSessionForFulfillment({
        session: {
          ...paidTestSession,
          line_items: { data: [{ price: { id: STRIPE_ACTIVATION_PRICE_ID, unit_amount: 499, currency: "usd" } }] },
        },
        expectedConnectionId: "conn-1",
        expectedProjectId: "proj-1",
        expectedContractorProfileId: "pro-1",
        reservationActive: true,
        hasSlot: true,
        stripeTestMode: true,
        expectedPriceId: STRIPE_CONNECTION_PRICE_ID,
      }),
    ).toMatchObject({ grant: false, reason: "wrong_price_id", needsRefund: true });
    expect(assertConnectionPriceMatchesMode(
      { id: "price_other", livemode: false, currency: "usd", unit_amount: 499, type: "one_time" },
      { expectedPriceId: STRIPE_CONNECTION_PRICE_ID, testMode: true },
    )).toEqual({ ok: false, reason: "wrong_price_id" });
    expect(fulfill).toMatch(/wrong connection Price ID/);
    expect(fulfill).toMatch(/stripe_activation_price_id/);
  });

  it("9. wrong amount fails closed", () => {
    expect(
      evaluateStripeSessionForFulfillment({
        session: { ...paidTestSession, amount_total: 999 },
        expectedConnectionId: "conn-1",
        expectedProjectId: "proj-1",
        expectedContractorProfileId: "pro-1",
        reservationActive: true,
        hasSlot: true,
        stripeTestMode: true,
        expectedPriceId: STRIPE_CONNECTION_PRICE_ID,
      }),
    ).toMatchObject({ grant: false, reason: "wrong_amount", needsRefund: true });
    expect(assertConnectionPriceMatchesMode(
      { id: STRIPE_CONNECTION_PRICE_ID, livemode: false, currency: "usd", unit_amount: 999, type: "one_time" },
      { expectedPriceId: STRIPE_CONNECTION_PRICE_ID, testMode: true },
    )).toEqual({ ok: false, reason: "wrong_amount" });
    expect(fulfill).toMatch(/connection fee is server-authoritative and must be 499 cents/);
    expect(fn).toMatch(/must be 499 cents/);
  });

  it("10. wrong currency fails closed", () => {
    expect(
      evaluateStripeSessionForFulfillment({
        session: { ...paidTestSession, currency: "eur" },
        expectedConnectionId: "conn-1",
        expectedProjectId: "proj-1",
        expectedContractorProfileId: "pro-1",
        reservationActive: true,
        hasSlot: true,
        stripeTestMode: true,
        expectedPriceId: STRIPE_CONNECTION_PRICE_ID,
      }),
    ).toMatchObject({ grant: false, reason: "wrong_currency", needsRefund: true });
    expect(assertConnectionPriceMatchesMode(
      { id: STRIPE_CONNECTION_PRICE_ID, livemode: false, currency: "eur", unit_amount: 499, type: "one_time" },
      { expectedPriceId: STRIPE_CONNECTION_PRICE_ID, testMode: true },
    )).toEqual({ ok: false, reason: "wrong_currency" });
    expect(fulfill).toMatch(/connection fee currency must be usd/);
    expect(fn).toMatch(/currency must be usd/);
  });

  it("11. success URL cannot grant", () => {
    expect(successUrlUnlocksContact("session_id=cs_test_abc&paid=1")).toBe(false);
    expect(successUrlUnlocksContact("session_id=cs_live_abc&paid=1")).toBe(false);
    expect(trustedFulfillmentPathOnly("success_url")).toBe(false);
    expect(trustedFulfillmentPathOnly("webhook")).toBe(true);
    expect(trustedFulfillmentPathOnly("reconcile")).toBe(true);
    const returnPage = readFileSync(path.join(repoRoot, "src/pages/app/pro/ConnectionCheckoutReturnPage.tsx"), "utf8");
    expect(returnPage).toMatch(/successUrlUnlocksContact/);
    expect(returnPage).toMatch(/This page cannot unlock contact/);
    expect(fn).toMatch(/success URL is not a trusted Stripe session/);
    expect(config).toMatch(/verify_jwt = false/);
  });

  it("12. duplicate webhook/reconcile idempotent", () => {
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
    expect(ledger.stripeCharges).toBe(1);
    expect(fulfill).toMatch(/'idempotent', true/);
    expect(sql).toMatch(/processor_event_id text NOT NULL UNIQUE/);
  });

  it("13. #14 remains sole entitlement", () => {
    expect(sql).toMatch(/CREATE TABLE public\.booking_contact_access/);
    expect(sql).toMatch(/DROP TABLE IF EXISTS public\.connection_contact_access/);
    expect(helper).toMatch(/FROM public\.booking_contact_access a/);
    expect(helper).not.toMatch(/FROM public\.project_connections/);
    expect(helper).not.toMatch(/connection_contact_access/);
    expect(grant).toMatch(/CONNECTION_FEE_PAYMENT/);
    expect(fulfill).toMatch(/grant_booking_contact_access_from_connection_fee/);
    expect(reserve).not.toMatch(/INSERT INTO public\.booking_contact_access/);
    expect(fulfill.indexOf("paid_but_reservation_not_active")).toBeLessThan(
      fulfill.indexOf("grant_booking_contact_access_from_connection_fee"),
    );
  });

  it("14. max-3 remains race-safe", () => {
    expect(fourthFinalizedConnectionAllowed(3)).toBe(false);
    const winners = concurrentFinalSlotAttempts([1, 2]);
    expect(winners.filter((slot) => slot != null)).toHaveLength(1);
    const ledger = createHardeningLedger();
    expect(tryReserve({ ledger, projectId: "proj-1", contractorProfileId: "pro-a", now: t0 }).ok).toBe(true);
    expect(tryReserve({ ledger, projectId: "proj-1", contractorProfileId: "pro-b", now: t0 }).ok).toBe(true);
    expect(tryReserve({ ledger, projectId: "proj-1", contractorProfileId: "pro-c", now: t0 }).ok).toBe(true);
    expect(tryReserve({ ledger, projectId: "proj-1", contractorProfileId: "pro-d", now: t0 })).toEqual({
      ok: false,
      reason: "connections full",
    });
    expect(reserve).toMatch(/IF occupied >= 3 THEN/);
    expect(reserve).toMatch(/EXCEPTION WHEN unique_violation THEN/);
    expect(reserve).toMatch(/SELECT \* INTO proj FROM public\.projects WHERE id = p_project_id FOR UPDATE/);
    expect(sql).toMatch(/CONSTRAINT connection_slots_range CHECK \(slot_number BETWEEN 1 AND 3\)/);
  });

  it("does not enable payment flags, signup fee, or hardcoded LIVE secrets", () => {
    const latest = readFileSync(
      path.join(repoRoot, "supabase/migrations/20260929000001_stripe_environment_control.sql"),
      "utf8",
    );
    expect(latest).not.toMatch(/connection_fee_checkout_enabled',\s*1/);
    expect(latest).not.toMatch(/stripe_test_mode',\s*0/);
    expect(latest).not.toMatch(/payments_live',\s*1/);
    expect(latest).not.toMatch(/charges_live',\s*1/);
    expect(latest).not.toMatch(/signup_fee_enabled',\s*1/);
    expect(fn).not.toMatch(/sk_live_[A-Za-z0-9]{8,}/);
    const connectionOnly = [
      "create-connection-checkout",
      "reconcile-connection-checkout",
      "connection-fee-webhook",
    ]
      .map((name) => readFileSync(path.join(repoRoot, "supabase/functions", name, "index.ts"), "utf8"))
      .join("\n");
    expect(connectionOnly).not.toMatch(/create-signup-fee-checkout/);
    expect(config).toMatch(/connection-fee-webhook/);
    expect(config).toMatch(/verify_jwt = false/);
  });
});
