import {
  STRIPE_ACTIVATION_PRICE_ID,
  STRIPE_TEST_CONNECTION_PRICE_ID,
  checkoutSessionIdMatchesMode,
  livemodeMismatchReason,
  requireStripeSecretForMode,
} from "../marketplace/stripeEnvironment";
import {
  SIGNUP_FEE_CENTS,
  SIGNUP_FEE_CURRENCY,
  SIGNUP_FEE_KIND,
  SIGNUP_PRICE_TYPE,
} from "./constants";

export type ActivationPriceLike = {
  id?: string | null;
  livemode?: boolean | null;
  currency?: string | null;
  unit_amount?: number | null;
  type?: string | null;
};

export type SignupCheckoutSessionLike = {
  id?: string;
  livemode?: boolean;
  mode?: string;
  payment_status?: string;
  currency?: string | null;
  amount_total?: number | null;
  client_reference_id?: string | null;
  metadata?: Record<string, string | undefined> | null;
  line_items?: {
    data?: Array<{
      price?: { id?: string; unit_amount?: number | null; currency?: string | null } | null;
      amount_total?: number | null;
    }>;
  } | null;
};

export type SignupFulfillDecision =
  | { ok: true; activate: true; grantContact: false; reason: "paid_valid_session" }
  | { ok: true; activate: false; grantContact: false; reason: "already_fulfilled" }
  | { ok: false; activate: false; grantContact: false; reason: string; needsRefund?: boolean };

export function requireActivationPriceId(envPriceId: string | null | undefined): string {
  const value = (envPriceId ?? "").trim();
  if (!value.startsWith("price_") || value.length < 8) {
    throw new Error("STRIPE_ACTIVATION_PRICE_ID is required");
  }
  if (value === STRIPE_TEST_CONNECTION_PRICE_ID) {
    throw new Error("connection Price ID must not be used for account activation");
  }
  return value;
}

export function assertActivationPriceMatchesMode(
  price: ActivationPriceLike | null | undefined,
  input: { expectedPriceId: string; testMode: boolean },
): { ok: true } | { ok: false; reason: string } {
  const expected = (input.expectedPriceId ?? "").trim();
  if (!expected.startsWith("price_")) return { ok: false, reason: "missing_price_id" };
  if (!price || !price.id) return { ok: false, reason: "missing_price_id" };
  if (price.id !== expected) return { ok: false, reason: "wrong_price_id" };
  if (price.id === STRIPE_TEST_CONNECTION_PRICE_ID) return { ok: false, reason: "wrong_price_id" };
  const livemodeReason = livemodeMismatchReason(Boolean(price.livemode), input.testMode);
  if (livemodeReason) return { ok: false, reason: "price_livemode_mismatch" };
  if ((price.currency ?? "").toLowerCase() !== SIGNUP_FEE_CURRENCY) {
    return { ok: false, reason: "wrong_currency" };
  }
  if (price.unit_amount !== SIGNUP_FEE_CENTS) {
    return { ok: false, reason: "wrong_amount" };
  }
  if (price.type && price.type !== SIGNUP_PRICE_TYPE) {
    return { ok: false, reason: "wrong_price_type" };
  }
  return { ok: true };
}

export function assertActivationPriceOrThrow(
  price: ActivationPriceLike | null | undefined,
  input: { expectedPriceId: string; testMode: boolean },
): void {
  const result = assertActivationPriceMatchesMode(price, input);
  if (result.ok) return;
  if (result.reason === "missing_price_id") throw new Error("STRIPE_ACTIVATION_PRICE_ID is required");
  if (result.reason === "wrong_price_id") throw new Error("wrong activation Price ID");
  if (result.reason === "wrong_currency") throw new Error("signup fee currency must be usd");
  if (result.reason === "wrong_amount") throw new Error("signup fee is server-authoritative and must be 999 cents");
  if (result.reason === "wrong_price_type") throw new Error("activation Price must be a one_time Price");
  throw new Error("Stripe Price livemode does not match stripe_test_mode");
}

export function evaluateSignupSessionForFulfillment(input: {
  session: SignupCheckoutSessionLike;
  expectedProfileId: string;
  alreadyPaid?: boolean;
  stripeTestMode?: boolean;
  signupFeeEnabled?: boolean;
  expectedPriceId?: string | null;
}): SignupFulfillDecision {
  if (input.signupFeeEnabled === false) {
    return { ok: false, activate: false, grantContact: false, reason: "signup_fee_disabled" };
  }
  const testMode = input.stripeTestMode !== false;
  const session = input.session;
  const livemodeReason = livemodeMismatchReason(session.livemode, testMode);
  if (livemodeReason) {
    return { ok: false, activate: false, grantContact: false, reason: livemodeReason };
  }
  if (!session.id || !checkoutSessionIdMatchesMode(String(session.id), testMode)) {
    return { ok: false, activate: false, grantContact: false, reason: "fake_or_mismatched_session" };
  }
  if (session.mode && session.mode !== "payment") {
    return { ok: false, activate: false, grantContact: false, reason: "wrong_mode" };
  }
  const metadata = session.metadata ?? {};
  if (metadata.ppp_kind !== SIGNUP_FEE_KIND) {
    return { ok: false, activate: false, grantContact: false, reason: "mismatched_metadata" };
  }
  if (metadata.profile_id !== input.expectedProfileId) {
    return { ok: false, activate: false, grantContact: false, reason: "mismatched_metadata" };
  }
  if (session.client_reference_id && session.client_reference_id !== input.expectedProfileId) {
    return { ok: false, activate: false, grantContact: false, reason: "mismatched_metadata" };
  }
  const expectedPriceId = (input.expectedPriceId ?? (testMode ? STRIPE_ACTIVATION_PRICE_ID : "")).trim();
  if (!expectedPriceId.startsWith("price_")) {
    return { ok: false, activate: false, grantContact: false, reason: "missing_price_id" };
  }
  const priceId = session.line_items?.data?.[0]?.price?.id ?? null;
  if (!priceId) {
    return { ok: false, activate: false, grantContact: false, reason: "missing_price_id" };
  }
  if (priceId !== expectedPriceId || priceId === STRIPE_TEST_CONNECTION_PRICE_ID) {
    return { ok: false, activate: false, grantContact: false, reason: "wrong_price_id", needsRefund: true };
  }
  const currency = (session.currency ?? session.line_items?.data?.[0]?.price?.currency ?? "").toLowerCase();
  if (currency && currency !== SIGNUP_FEE_CURRENCY) {
    return { ok: false, activate: false, grantContact: false, reason: "wrong_currency", needsRefund: true };
  }
  const amount = session.amount_total ?? session.line_items?.data?.[0]?.amount_total ?? null;
  if (amount != null && amount !== SIGNUP_FEE_CENTS) {
    return { ok: false, activate: false, grantContact: false, reason: "wrong_amount", needsRefund: true };
  }
  if (session.payment_status !== "paid") {
    return { ok: false, activate: false, grantContact: false, reason: "unpaid" };
  }
  if (input.alreadyPaid) {
    return { ok: true, activate: false, grantContact: false, reason: "already_fulfilled" };
  }
  return { ok: true, activate: true, grantContact: false, reason: "paid_valid_session" };
}

export function requireSignupStripeSecret(secret: string, testMode: boolean): string {
  return requireStripeSecretForMode(secret, testMode);
}

export function clientCannotSetSignupPrice(attempted: string | number | null | undefined): boolean {
  return attempted == null || attempted === "";
}
