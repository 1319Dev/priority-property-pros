import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const read = (rel: string) => readFileSync(path.join(root, rel), "utf8");
const migration = read("supabase/migrations/20261020200001_connection_checkout_validity_and_refunds.sql");
const rollback = read("supabase/rollbacks/20261020200001_connection_checkout_validity_and_refunds_rollback.sql");
const webhook = read("supabase/functions/connection-fee-webhook/index.ts");
const reconcile = read("supabase/functions/reconcile-connection-checkout/index.ts");
const checkout = read("supabase/functions/create-connection-checkout/index.ts");

function fn(name: string): string {
  const marker = `CREATE OR REPLACE FUNCTION public.${name}(`;
  const start = migration.indexOf(marker);
  expect(start).toBeGreaterThan(-1);
  const end = migration.indexOf("\n$$;", start);
  return migration.slice(start, end);
}

describe("Connection Fee validity and refund migration", () => {
  it("does not change fees, Price IDs, or existing checkout/fulfill functions", () => {
    for (const name of [
      "reserve_connection_checkout",
      "fulfill_connection_fee_checkout",
      "attach_connection_checkout_session",
      "flag_connection_checkout_needs_refund",
      "connection_fee_checkout_flags",
    ]) {
      expect(migration).not.toContain(`FUNCTION public.${name}(`);
    }
    expect(migration).not.toMatch(/platform_settings|price_1|stripe_test_mode\s*=|payments_live',\s*1|charges_live',\s*1/);
    expect(migration).toMatch(/CHECK \(amount_cents = 499\)/);
  });

  it("keeps one refund row per Checkout session and per PaymentIntent", () => {
    expect(migration).toMatch(/CONSTRAINT connection_fee_refunds_session_key UNIQUE \(stripe_checkout_session_id\)/);
    expect(migration).toMatch(/CONSTRAINT connection_fee_refunds_refund_key UNIQUE \(stripe_refund_id\)/);
    expect(migration).toMatch(/CREATE UNIQUE INDEX IF NOT EXISTS connection_fee_refunds_pi_key/);
    expect(migration).toMatch(/ON CONFLICT \(stripe_checkout_session_id\) DO NOTHING/);
  });

  it("never refunds the session that delivered a PAID connection", () => {
    const prepare = fn("prepare_connection_fee_refund");
    expect(prepare).toMatch(/never refund the session that delivered a PAID connection/i);
    expect(prepare).toMatch(/'delivered_connection_not_refunded'/);
    expect(prepare).toMatch(/'duplicate_payment'/);
    expect(fn("connection_checkout_session_validity")).toMatch(/IF conn\.status IN \('PAID', 'COMPLETED'\) THEN\s+RETURN jsonb_build_object\('ok', true/);
  });

  it("checks cancelled, closed, draft, selected-elsewhere, blocked, customer, contractor, and expired opportunity", () => {
    const blocker = fn("connection_checkout_blocker");
    for (const reason of [
      "project_cancelled",
      "project_not_posted",
      "connections_closed",
      "project_contractor_selected",
      "customer_unavailable",
      "contractor_ineligible",
      "contractor_blocked",
      "opportunity_unavailable",
    ]) {
      expect(blocker).toContain(`'${reason}'`);
    }
    expect(blocker).toMatch(/o\.expires_at IS NULL OR o\.expires_at > now\(\)/);
  });

  it("is service-role only for writes; admins can read the reconcile report", () => {
    for (const sig of [
      "prepare_connection_fee_refund(text, text, integer, text, boolean, text, boolean)",
      "record_connection_fee_refund_result(uuid, text, text, integer, text)",
      "record_connection_fee_refund_verification(text, text, integer, text, text)",
      "assert_connection_checkout_allowed(uuid, uuid)",
      "connection_checkout_session_validity(text)",
    ]) {
      expect(migration).toContain(`REVOKE ALL ON FUNCTION public.${sig} FROM PUBLIC, anon, authenticated;`);
      expect(migration).toContain(`GRANT EXECUTE ON FUNCTION public.${sig} TO service_role;`);
    }
    expect(migration).toMatch(/REVOKE ALL ON TABLE public\.connection_fee_refunds FROM PUBLIC, anon, authenticated/);
    expect(fn("connection_fee_refund_reconcile_report")).toMatch(/NOT public\.is_admin\(\)/);
  });

  it("audits and alerts admins", () => {
    expect(fn("prepare_connection_fee_refund")).toMatch(/write_audit_log\(NULL, 'connection_fee\.refund\.flagged'/);
    expect(fn("prepare_connection_fee_refund")).toMatch(/alert_admins_connection_fee_refund/);
    expect(fn("record_connection_fee_refund_result")).toMatch(/'connection_fee\.refund\.' \|\| lower\(v_status\)/);
    expect(fn("alert_admins_connection_fee_refund")).toMatch(/account_type = 'ADMIN' AND p\.account_status = 'ACTIVE'/);
  });

  it("has a rollback that drops every new object", () => {
    for (const name of [
      "connection_fee_refund_reconcile_report",
      "connection_fee_refund_reconcile_rows",
      "record_connection_fee_refund_verification",
      "record_connection_fee_refund_result",
      "prepare_connection_fee_refund",
      "alert_admins_connection_fee_refund",
      "connection_checkout_session_validity",
      "assert_connection_checkout_allowed",
      "connection_checkout_blocker",
      "protect_connection_fee_refund_row",
      "connection_fee_refund_status_from_stripe",
    ]) {
      expect(rollback).toContain(`DROP FUNCTION IF EXISTS public.${name}(`);
    }
    expect(rollback).toMatch(/DROP TABLE IF EXISTS public\.connection_fee_refunds/);
    expect(rollback).toMatch(/Back it up before dropping/);
  });
});

describe("edge functions use the checks", () => {
  it("refuses checkout before reserve when the connection is not allowed", () => {
    const allowedAt = checkout.indexOf('restRpc("assert_connection_checkout_allowed"');
    const reserveAt = checkout.indexOf('restRpc("reserve_connection_checkout"');
    const stripeAt = checkout.indexOf('stripeForm(secret, "checkout/sessions"');
    expect(allowedAt).toBeGreaterThan(-1);
    expect(allowedAt).toBeLessThan(reserveAt);
    expect(allowedAt).toBeLessThan(stripeAt);
    expect(checkout).toMatch(/}, 409\);/);
  });

  it("re-validates before fulfill in the webhook and the return-page reconcile", () => {
    for (const source of [webhook, reconcile]) {
      const validityAt = source.indexOf('restRpc("connection_checkout_session_validity"');
      const fulfillAt = source.indexOf('restRpc("fulfill_connection_fee_checkout"');
      expect(validityAt).toBeGreaterThan(-1);
      expect(validityAt).toBeLessThan(fulfillAt);
      expect(source).toMatch(/refundConnectionFeeIfNeeded\(restRpc, refunds, refundInput\)/);
    }
  });

  it("keeps webhook signature verification first and answers 500 on refund failure so Stripe retries", () => {
    expect(webhook.indexOf("verifyStripeSignature(rawBody")).toBeLessThan(webhook.indexOf("isConnectionRefundObject(obj)"));
    expect(webhook).toMatch(/"refund pending retry"[^\n]*500\)/);
    expect(webhook).toMatch(/auto: false/);
  });
});
