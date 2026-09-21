import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  STRIPE_ACTIVATION_PRICE_ID,
  STRIPE_TEST_CONNECTION_PRICE_ID,
  requireStripeSecretForMode,
} from "../marketplace/stripeEnvironment";
import {
  FORBIDDEN_LEGACY_SIGNUP_FEE_CENTS,
  SIGNUP_FEE_CENTS,
  SIGNUP_FEE_KIND,
  SIGNUP_FEE_RECONCILE_FUNCTION,
  SIGNUP_FEE_WEBHOOK_FUNCTION,
} from "./constants";
import {
  assertActivationPriceMatchesMode,
  assertActivationPriceOrThrow,
  evaluateSignupSessionForFulfillment,
  requireActivationPriceId,
} from "./checkout";
import {
  accountStatusAfterSignupPayment,
  approvalAfterSignupPayment,
  assertSignupFeeAmount,
  canClientMarkSignupFeePaid,
  canceledCheckoutLeavesUnpaid,
  needsSignupFeePayment,
  payingSignupFeeApprovesContractor,
  payingSignupFeeGrantsProjectContact,
  successUrlMarksSignupFeePaid,
} from "./policy";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const TEST_SECRET = "sk_test_1234567890abcd";
const LIVE_SECRET = "sk_live_1234567890abcd";
const LIVE_ACTIVATION_PRICE = "price_live_activation_999";

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

function srcFile(relative: string): string {
  return readFileSync(path.join(repoRoot, relative), "utf8");
}

const paidTestSession = {
  id: "cs_test_signup_valid",
  livemode: false,
  mode: "payment" as const,
  payment_status: "paid",
  currency: "usd",
  amount_total: 999,
  client_reference_id: "user-1",
  metadata: { ppp_kind: SIGNUP_FEE_KIND, profile_id: "user-1" },
  line_items: {
    data: [{ price: { id: STRIPE_ACTIVATION_PRICE_ID, unit_amount: 999, currency: "usd" }, amount_total: 999 }],
  },
};

const paidLiveSession = {
  ...paidTestSession,
  id: "cs_live_signup_valid",
  livemode: true,
  line_items: {
    data: [{ price: { id: LIVE_ACTIVATION_PRICE, unit_amount: 999, currency: "usd" }, amount_total: 999 }],
  },
};

describe("Signup / activation fee amount and mode guards", () => {
  const sql = allSql();
  const latest = srcFile("supabase/migrations/20261005000001_signup_activation_checkout.sql");
  const createFn = srcFile("supabase/functions/create-signup-fee-checkout/index.ts");
  const reconcileFn = srcFile("supabase/functions/reconcile-signup-fee-checkout/index.ts");
  const webhookFn = srcFile("supabase/functions/signup-fee-webhook/index.ts");
  const stripeEnv = srcFile("supabase/functions/_shared/stripeEnv.ts");
  const config = srcFile("supabase/config.toml");
  const fulfill = functionBody(sql, "fulfill_signup_fee_checkout");
  const register = functionBody(sql, "register_signup_fee_checkout");

  it("locks the amount at 999 cents and rejects 900 or 499", () => {
    expect(SIGNUP_FEE_CENTS).toBe(999);
    expect(assertSignupFeeAmount(999)).toBe(999);
    expect(() => assertSignupFeeAmount(FORBIDDEN_LEGACY_SIGNUP_FEE_CENTS)).toThrow(/999/);
    expect(() => assertSignupFeeAmount(499)).toThrow(/999/);
    expect(latest).toMatch(/CONSTRAINT signup_checkout_amount_check CHECK \(amount_cents = 999\)/);
    expect(fulfill).toMatch(/p_amount_cents IS DISTINCT FROM 999/);
    expect(stripeEnv).toMatch(/must be 999 cents/);
    expect(
      evaluateSignupSessionForFulfillment({
        session: { ...paidTestSession, amount_total: 499 },
        expectedProfileId: "user-1",
        expectedPriceId: STRIPE_ACTIVATION_PRICE_ID,
        signupFeeEnabled: true,
        stripeTestMode: true,
      }),
    ).toEqual({ ok: false, activate: false, grantContact: false, reason: "wrong_amount", needsRefund: true });
  });

  it("requires the server activation Price, one_time, usd, and matching livemode", () => {
    expect(requireActivationPriceId(STRIPE_ACTIVATION_PRICE_ID)).toBe(STRIPE_ACTIVATION_PRICE_ID);
    expect(() => requireActivationPriceId(STRIPE_TEST_CONNECTION_PRICE_ID)).toThrow(/connection Price ID/);
    expect(() => requireActivationPriceId("")).toThrow(/STRIPE_ACTIVATION_PRICE_ID is required/);
    expect(
      assertActivationPriceMatchesMode(
        { id: STRIPE_ACTIVATION_PRICE_ID, livemode: false, currency: "usd", unit_amount: 999, type: "one_time" },
        { expectedPriceId: STRIPE_ACTIVATION_PRICE_ID, testMode: true },
      ),
    ).toEqual({ ok: true });
    expect(
      assertActivationPriceMatchesMode(
        { id: STRIPE_ACTIVATION_PRICE_ID, livemode: true, currency: "usd", unit_amount: 999, type: "one_time" },
        { expectedPriceId: STRIPE_ACTIVATION_PRICE_ID, testMode: true },
      ),
    ).toEqual({ ok: false, reason: "price_livemode_mismatch" });
    expect(() =>
      assertActivationPriceOrThrow(
        { id: STRIPE_ACTIVATION_PRICE_ID, livemode: false, currency: "usd", unit_amount: 499, type: "one_time" },
        { expectedPriceId: STRIPE_ACTIVATION_PRICE_ID, testMode: true },
      ),
    ).toThrow(/999 cents/);
    expect(createFn).toMatch(/assertActivationPriceOrThrow/);
    expect(createFn).toMatch(/requireActivationPriceId/);
    expect(createFn).toMatch(/line_items\[0\]\[price\]/);
    expect(createFn).not.toMatch(/price_data/);
  });

  it("fails closed when stripe_test_mode, key, and event.livemode disagree", () => {
    expect(requireStripeSecretForMode(TEST_SECRET, true)).toBe(TEST_SECRET);
    expect(() => requireStripeSecretForMode(LIVE_SECRET, true)).toThrow(/Live keys are forbidden/);
    expect(requireStripeSecretForMode(LIVE_SECRET, false)).toBe(LIVE_SECRET);
    expect(() => requireStripeSecretForMode(TEST_SECRET, false)).toThrow(/Test keys are forbidden/);
    expect(
      evaluateSignupSessionForFulfillment({
        session: paidLiveSession,
        expectedProfileId: "user-1",
        expectedPriceId: LIVE_ACTIVATION_PRICE,
        signupFeeEnabled: true,
        stripeTestMode: true,
      }),
    ).toEqual({ ok: false, activate: false, grantContact: false, reason: "live_mode_forbidden" });
    expect(
      evaluateSignupSessionForFulfillment({
        session: paidTestSession,
        expectedProfileId: "user-1",
        expectedPriceId: STRIPE_ACTIVATION_PRICE_ID,
        signupFeeEnabled: true,
        stripeTestMode: false,
      }),
    ).toEqual({ ok: false, activate: false, grantContact: false, reason: "test_mode_forbidden" });
    expect(webhookFn).toMatch(/livemodeMatchesStripeTestMode/);
    expect(webhookFn).toMatch(/STRIPE_SIGNUP_FEE_WEBHOOK_SECRET/);
    expect(register).toMatch(/assert_connection_stripe_environment/);
    expect(fulfill).toMatch(/assert_connection_stripe_environment/);
  });

  it("activates the account without granting #14 contact or approving contractors", () => {
    expect(
      evaluateSignupSessionForFulfillment({
        session: paidTestSession,
        expectedProfileId: "user-1",
        expectedPriceId: STRIPE_ACTIVATION_PRICE_ID,
        signupFeeEnabled: true,
        stripeTestMode: true,
      }),
    ).toEqual({ ok: true, activate: true, grantContact: false, reason: "paid_valid_session" });
    expect(payingSignupFeeGrantsProjectContact()).toBe(false);
    expect(payingSignupFeeApprovesContractor()).toBe(false);
    expect(approvalAfterSignupPayment("PENDING")).toBe("PENDING");
    expect(accountStatusAfterSignupPayment("PENDING")).toBe("PENDING");
    expect(successUrlMarksSignupFeePaid()).toBe(false);
    expect(canceledCheckoutLeavesUnpaid()).toBe(true);
    expect(canClientMarkSignupFeePaid()).toBe(false);
    expect(fulfill).toMatch(/signup_fee_status = 'PAID'/);
    expect(fulfill).toMatch(/contact_unlocked', false/);
    expect(fulfill).toMatch(/account_status_unchanged/);
    expect(fulfill).not.toMatch(/grant_booking_contact_access/);
    expect(fulfill).not.toMatch(/booking_contact_access/);
    expect(webhookFn).toMatch(/contact_unlocked: false/);
    expect(reconcileFn).toMatch(/contact_unlocked: false/);
  });

  it("keeps current behavior when signup_fee_enabled is off and does not flip flags", () => {
    expect(needsSignupFeePayment({ enabled: false, accountType: "CUSTOMER", status: "UNPAID" })).toBe(false);
    expect(needsSignupFeePayment({ enabled: true, accountType: "CUSTOMER", status: "UNPAID" })).toBe(true);
    expect(needsSignupFeePayment({ enabled: true, accountType: "CUSTOMER", status: "PAID" })).toBe(false);
    expect(
      evaluateSignupSessionForFulfillment({
        session: paidTestSession,
        expectedProfileId: "user-1",
        expectedPriceId: STRIPE_ACTIVATION_PRICE_ID,
        signupFeeEnabled: false,
        stripeTestMode: true,
      }),
    ).toEqual({ ok: false, activate: false, grantContact: false, reason: "signup_fee_disabled" });
    expect(latest).not.toMatch(/signup_fee_enabled',\s*1/);
    expect(latest).not.toMatch(/payments_live',\s*1/);
    expect(latest).not.toMatch(/charges_live',\s*1/);
    expect(latest).not.toMatch(/connection_fee_checkout_enabled',\s*1/);
    expect(latest).not.toMatch(/stripe_test_mode',\s*0/);
    expect(latest).toMatch(/Does NOT flip payments_live, charges_live, signup_fee_enabled/);
    expect(functionBody(sql, "signup_fee_is_satisfied")).toMatch(/IF NOT public\.signup_fee_enabled\(\)/);
  });

  it("uses a separate webhook and never puts secrets in git", () => {
    expect(config).toMatch(/create-signup-fee-checkout/);
    expect(config).toMatch(/reconcile-signup-fee-checkout/);
    expect(config).toMatch(/signup-fee-webhook/);
    expect(config).toMatch(/STRIPE_SIGNUP_FEE_WEBHOOK_SECRET/);
    expect(createFn).toMatch(/Deno\.serve/);
    expect(webhookFn).toMatch(/verifyStripeSignature/);
    expect(createFn + reconcileFn + webhookFn + latest).not.toMatch(/sk_live_[A-Za-z0-9]{8,}/);
    expect(createFn + reconcileFn + webhookFn).not.toMatch(/sk_test_[A-Za-z0-9]{8,}/);
    expect(createFn + reconcileFn + webhookFn).not.toMatch(/whsec_[A-Za-z0-9]{8,}/);
    expect(createFn).not.toMatch(/transfer_data|application_fee|destination_charge/);
    expect(SIGNUP_FEE_RECONCILE_FUNCTION).toBe("reconcile-signup-fee-checkout");
    expect(SIGNUP_FEE_WEBHOOK_FUNCTION).toBe("signup-fee-webhook");
  });
});
