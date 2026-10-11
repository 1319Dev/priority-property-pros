import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  assertPaidActivationSession,
  assertPaidConnectionSession,
} from "../../../supabase/functions/_shared/stripeEnv.ts";
import { successUrlUnlocksContact, trustedFulfillmentPathOnly } from "./connectionCheckout";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const connectionPrice = "price_connection_server_499";
const activationPrice = "price_activation_server_999";

function read(name: string): string {
  return readFileSync(path.join(root, name), "utf8");
}

function allSql(): string {
  const dir = path.join(root, "supabase/migrations");
  return readdirSync(dir)
    .filter((name) => name.endsWith(".sql"))
    .sort()
    .map((name) => readFileSync(path.join(dir, name), "utf8"))
    .join("\n");
}

function functionBody(sql: string, name: string): string {
  const marker = `CREATE OR REPLACE FUNCTION public.${name}`;
  const start = sql.lastIndexOf(marker);
  expect(start, name).toBeGreaterThan(-1);
  const rest = sql.slice(start);
  const end = rest.indexOf("\nCREATE OR REPLACE FUNCTION public.", marker.length);
  return end === -1 ? rest : rest.slice(0, end);
}

function collect(entry: string, acc: string[] = []): string[] {
  const stats = statSync(entry);
  if (stats.isDirectory()) {
    if (path.basename(entry) === "node_modules") return acc;
    for (const child of readdirSync(entry)) collect(path.join(entry, child), acc);
    return acc;
  }
  if (/\.(sql|ts)$/.test(entry)) acc.push(entry);
  return acc;
}

function paidConnectionSession(overrides: Record<string, unknown> = {}) {
  return {
    id: "cs_live_12345678",
    livemode: true,
    amount_total: 499,
    currency: "usd",
    line_items: { data: [{ price: { id: connectionPrice } }] },
    ...overrides,
  };
}

function paidActivationSession(overrides: Record<string, unknown> = {}) {
  return {
    id: "cs_live_87654321",
    livemode: true,
    amount_total: 999,
    currency: "usd",
    line_items: { data: [{ price: { id: activationPrice } }] },
    ...overrides,
  };
}

describe("payment amount, currency, and server-side status", () => {
  const sql = allSql();
  const connectionFulfill = functionBody(sql, "fulfill_connection_fee_checkout");
  const signupFulfill = functionBody(sql, "fulfill_signup_fee_checkout");
  const connectionWebhook = read("supabase/functions/connection-fee-webhook/index.ts");
  const signupWebhook = read("supabase/functions/signup-fee-webhook/index.ts");

  it("accepts a retrieved 499 usd connection session and rejects amount, currency, and price mismatches", () => {
    expect(
      assertPaidConnectionSession(paidConnectionSession(), { expectedPriceId: connectionPrice, testMode: false }),
    ).toEqual({ priceId: connectionPrice, amountCents: 499, currency: "usd" });
    expect(() =>
      assertPaidConnectionSession(paidConnectionSession({ amount_total: 500 }), {
        expectedPriceId: connectionPrice,
        testMode: false,
      }),
    ).toThrow(/499 cents/);
    expect(() =>
      assertPaidConnectionSession(paidConnectionSession({ currency: "eur" }), {
        expectedPriceId: connectionPrice,
        testMode: false,
      }),
    ).toThrow(/usd/);
    expect(() =>
      assertPaidConnectionSession(paidConnectionSession(), { expectedPriceId: activationPrice, testMode: false }),
    ).toThrow(/Price ID/);
    expect(() =>
      assertPaidConnectionSession(paidConnectionSession({ id: "cs_test_12345678", livemode: false }), {
        expectedPriceId: connectionPrice,
        testMode: false,
      }),
    ).toThrow(/test Stripe events are forbidden while stripe_test_mode=0/);
    expect(() =>
      assertPaidConnectionSession(paidConnectionSession({ id: "cs_test_12345678", livemode: true }), {
        expectedPriceId: connectionPrice,
        testMode: false,
      }),
    ).toThrow(/cs_live_/);
    expect(connectionFulfill).toMatch(/p_amount_cents IS DISTINCT FROM 499/);
    expect(connectionFulfill).toMatch(/connection fee currency must be usd/);
    expect(connectionFulfill).toMatch(/p_payment_status IS DISTINCT FROM 'paid'/);
  });

  it("accepts a retrieved 999 usd activation session and rejects amount, currency, and price mismatches", () => {
    expect(
      assertPaidActivationSession(paidActivationSession(), { expectedPriceId: activationPrice, testMode: false }),
    ).toEqual({ priceId: activationPrice, amountCents: 999, currency: "usd" });
    expect(() =>
      assertPaidActivationSession(paidActivationSession({ amount_total: 998 }), {
        expectedPriceId: activationPrice,
        testMode: false,
      }),
    ).toThrow(/999 cents/);
    expect(() =>
      assertPaidActivationSession(paidActivationSession({ currency: "EUR" }), {
        expectedPriceId: activationPrice,
        testMode: false,
      }),
    ).toThrow(/usd/);
    expect(signupFulfill).toMatch(/p_amount_cents IS DISTINCT FROM 999/);
    expect(signupFulfill).toMatch(/signup fee currency must be usd/);
    expect(signupFulfill).toMatch(/p_payment_status IS DISTINCT FROM 'paid'/);
    expect(signupFulfill).toMatch(/\b999\b/);
  });

  it("verifies payment status from the Stripe session the server retrieves, not from the success URL", () => {
    for (const source of [connectionWebhook, signupWebhook]) {
      const retrieved = source.indexOf("stripeGet(");
      const fulfilled = source.indexOf("fulfill_");
      expect(retrieved).toBeGreaterThan(-1);
      expect(fulfilled).toBeGreaterThan(retrieved);
      expect(source).toMatch(/payment_status/);
      expect(source).toMatch(/!== "paid"/);
      expect(source).toMatch(/p_amount_cents: validated\.amountCents/);
      expect(source).toMatch(/p_currency: validated\.currency/);
      expect(source).toMatch(/verifyStripeSignature/);
    }
    expect(connectionWebhook).toMatch(/assertPaidConnectionSession/);
    expect(signupWebhook).toMatch(/assertPaidActivationSession/);
    expect(successUrlUnlocksContact("?session_id=cs_live_123")).toBe(false);
    expect(trustedFulfillmentPathOnly("success_url")).toBe(false);
    expect(trustedFulfillmentPathOnly("webhook")).toBe(true);
  });
});

describe("idempotency, duplicate payments, refunds, and retention", () => {
  const sql = allSql();
  const connectionFulfill = functionBody(sql, "fulfill_connection_fee_checkout");
  const signupFulfill = functionBody(sql, "fulfill_signup_fee_checkout");
  const connectionRecord = functionBody(sql, "record_connection_checkout_event");
  const signupRecord = functionBody(sql, "record_signup_fee_event");
  const refund = read("supabase/migrations/20261001000001_non_refundable_platform_fees.sql");

  it("treats a repeated processor event as a duplicate and a second paid charge as idempotent", () => {
    expect(sql).toMatch(/processor_event_id text NOT NULL UNIQUE/);
    expect(sql).toMatch(
      /CREATE UNIQUE INDEX IF NOT EXISTS signup_fee_charges_one_paid[\s\S]*WHERE status IN \('PAID', 'CONSUMED'\)/,
    );
    expect(sql).toMatch(/stripe_checkout_session_id text NOT NULL UNIQUE/);
    for (const record of [connectionRecord, signupRecord]) {
      expect(record).toMatch(/WHERE processor_event_id = p_processor_event_id/);
      expect(record).toMatch(/'duplicate', true/);
      expect(record).not.toMatch(/DELETE FROM/);
    }
    expect(connectionFulfill).toMatch(/conn\.status IN \('PAID', 'COMPLETED'\)/);
    expect(connectionFulfill).toMatch(/'idempotent', true/);
    expect(signupFulfill).toMatch(/p\.signup_fee_status = 'PAID'/);
    expect(signupFulfill).toMatch(/'idempotent', true/);
  });

  it("keeps signup and connection fee refunds rejected", () => {
    expect(refund).toMatch(/RAISE EXCEPTION 'non_refundable_platform_fee'/);
    expect(refund).toMatch(
      /REVOKE ALL ON FUNCTION public\.reject_signup_or_connection_fee_refund\(\) FROM PUBLIC, anon, authenticated, service_role/,
    );
    expect(refund).not.toMatch(/GRANT EXECUTE ON FUNCTION public\.reject_signup_or_connection_fee_refund/);
    expect(refund).toMatch(/\$9\.99/);
    expect(refund).toMatch(/\$4\.99/);
    const guard = functionBody(sql, "guard_project_connection_money");
    expect(guard).toMatch(/fee_cents IS DISTINCT FROM 499/);
  });

  it("does not delete payment, checkout, or event rows from fulfillment or the client", () => {
    const tables = [
      "signup_fee_charges",
      "signup_fee_events",
      "connection_checkout_sessions",
      "connection_checkout_events",
    ];
    const hits: string[] = [];
    for (const file of [
      ...collect(path.join(root, "supabase/migrations")),
      ...collect(path.join(root, "supabase/functions")),
    ]) {
      const text = readFileSync(file, "utf8");
      for (const table of tables) {
        if (new RegExp(`DELETE FROM public\\.${table}\\b`, "i").test(text)) {
          hits.push(`${path.relative(root, file)} deletes ${table}`);
        }
      }
    }
    expect(hits).toEqual([]);
    for (const table of tables) {
      expect(sql).not.toMatch(new RegExp(`GRANT DELETE ON TABLE public\\.${table}`));
    }
    expect(functionBody(sql, "protect_signup_fee_charge_row")).toMatch(
      /signup fee charges cannot be written from the client/,
    );
    expect(functionBody(sql, "protect_signup_fee_event_row")).toMatch(
      /signup fee events cannot be written from the client/,
    );
    expect(functionBody(sql, "protect_connection_checkout_session_row")).toMatch(
      /connection checkout sessions cannot be written from the client/,
    );
    expect(functionBody(sql, "protect_connection_checkout_event_row")).toMatch(
      /connection checkout events cannot be written from the client/,
    );
  });
});
