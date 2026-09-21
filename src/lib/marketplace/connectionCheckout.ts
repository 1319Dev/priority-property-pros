/**
 * Connection Fee Checkout — server-authoritative rules for TEST and LIVE.
 * stripe_test_mode (DB) is the environment control. Price ID and amount never come from the browser.
 * Success URLs never unlock contact. Do not import Stripe secrets here.
 * Do not enable job payments / Connect / payouts. Signup/activation is a separate $9.99 flow.
 */

import { CONNECTION_FEE_CENTS } from "./types";
import { connectionEntitlementAllowsReveal } from "./connectionLifecycle";
import type { ContactAccessStatus, ProjectConnectionStatus } from "./types";
import {
  STRIPE_ACTIVATION_PRICE_ID as ACTIVATION_PRICE_ID,
  STRIPE_TEST_CONNECTION_PRICE_ID,
  checkoutSessionIdMatchesMode,
  livemodeMismatchReason,
  requireConnectionPriceId as requireEnvConnectionPriceId,
  requireStripeSecretForMode,
  requireTestStripeSecret as requireTestSecret,
  requireWebhookSecret as requireWhsec,
  serverConnectionPriceId as serverPriceFromEnv,
} from "./stripeEnvironment";

/** Known TEST catalog Price ID. Not a LIVE fallback. Never send from the client. */
export const STRIPE_CONNECTION_PRICE_ID = STRIPE_TEST_CONNECTION_PRICE_ID;

/** Known TEST catalog $9.99 activation Price ID. Signup checkout uses env STRIPE_ACTIVATION_PRICE_ID. */
export const STRIPE_ACTIVATION_PRICE_ID = ACTIVATION_PRICE_ID;

export const CONNECTION_FEE_CURRENCY = "usd";
export const CONNECTION_RESERVATION_TTL_SECONDS = 30 * 60;
export const CONNECTION_CHECKOUT_KIND = "connection_fee";

/** Client/build constant. Live behavior is platform_settings.connection_fee_checkout_enabled. */
export const CONNECTION_FEE_CHECKOUT_ENABLED = false;

export const LEGACY_JOB_PAYMENT_FUNCTIONS = [
  "stripe-webhook",
  "create-payment-intent",
  "create-connect-account-link",
  "create-transfer",
  "create-refund",
] as const;

export const SIGNUP_FEE_CHECKOUT_FUNCTIONS = [
  "create-signup-fee-checkout",
  "reconcile-signup-fee-checkout",
  "signup-fee-webhook",
] as const;

export type CheckoutSessionLike = {
  id?: string;
  object?: string;
  livemode?: boolean;
  mode?: string;
  payment_status?: string;
  status?: string;
  currency?: string | null;
  amount_total?: number | null;
  client_reference_id?: string | null;
  payment_intent?: string | { id?: string } | null;
  metadata?: Record<string, string | undefined> | null;
  line_items?: {
    data?: Array<{
      price?: { id?: string; unit_amount?: number | null; currency?: string | null } | null;
      amount_total?: number | null;
    }>;
  } | null;
};

export type FulfillDecision =
  | { ok: true; grant: true; reason: "paid_valid_session" }
  | { ok: true; grant: false; reason: "already_fulfilled" }
  | { ok: false; grant: false; reason: string; needsRefund?: boolean };

export function serverConnectionPriceId(clientPriceId?: string | null, envPriceId?: string | null): string {
  return serverPriceFromEnv(clientPriceId, envPriceId);
}

export function clientCannotSubstitutePriceId(attempted: string | null | undefined): boolean {
  if (attempted == null || attempted === "") return true;
  return attempted === STRIPE_CONNECTION_PRICE_ID;
}

export function clientCannotSubstituteAmount(attempted: number | null | undefined): boolean {
  if (attempted == null) return true;
  return attempted === CONNECTION_FEE_CENTS;
}

export function requireStripeSecretForCheckout(secret: string, testMode: boolean): string {
  return requireStripeSecretForMode(secret, testMode);
}

export function requireTestStripeSecret(secret: string): string {
  return requireTestSecret(secret);
}

export function requireWebhookSecret(secret: string): string {
  return requireWhsec(secret);
}

export function requireServerConnectionPriceId(envPriceId: string | null | undefined): string {
  return requireEnvConnectionPriceId(envPriceId);
}

/** Real Stripe PaymentIntent ids only. Fulfillment markers like `reconcile:cs_test_...` are not PaymentIntents. */
export function isStripePaymentIntentId(value: string | null | undefined): boolean {
  if (!value) return false;
  const id = value.trim();
  return id.startsWith("pi_") && id.length > 5 && !id.includes(":");
}

export function stripePaymentIntentId(value: unknown): string | null {
  if (typeof value === "string") return isStripePaymentIntentId(value) ? value.trim() : null;
  if (value && typeof value === "object" && "id" in value) {
    return stripePaymentIntentId((value as { id?: unknown }).id);
  }
  return null;
}

export function stripePaymentIntentIdFromSession(
  session: { payment_intent?: unknown } | null | undefined,
): string | null {
  return stripePaymentIntentId(session?.payment_intent);
}

/** PaymentIntent column: `pi_...` when Stripe provided one. Never a fulfillment-source marker. */
export function paymentIntentColumnValue(input: {
  paymentIntent?: unknown;
  processorEventId?: string | null;
}): string | null {
  void input.processorEventId;
  return stripePaymentIntentId(input.paymentIntent);
}

export function fulfillmentReferenceValue(processorEventId: string | null | undefined): string | null {
  const value = (processorEventId ?? "").trim();
  return value ? value : null;
}

export function successUrlUnlocksContact(_search: string | URLSearchParams | null | undefined): false {
  void _search;
  return false;
}

export function fakeSessionUnlocksContact(): false {
  return false;
}

export function unpaidSessionUnlocksContact(): false {
  return false;
}

export function queryParamPaidStateUnlocksContact(paidQuery: string | null | undefined): false {
  void paidQuery;
  return false;
}

export function reservationOccupiesSlot(
  status: ProjectConnectionStatus,
  reservedUntil: string | Date | null | undefined,
  now = new Date(),
): boolean {
  if (status === "PAID" || status === "COMPLETED" || status === "PAYMENT_DISABLED") return true;
  if (status !== "RESERVED") return false;
  if (!reservedUntil) return true;
  return new Date(reservedUntil).getTime() > now.getTime();
}

export function expiredReservationReleasesSpot(
  status: ProjectConnectionStatus,
  reservedUntil: string | Date,
  now = new Date(),
): boolean {
  return status === "RESERVED" && new Date(reservedUntil).getTime() <= now.getTime();
}

export function stopNewConnectionsRejectsCheckout(accepting: boolean, hasInFlightReservation: boolean): {
  rejectNew: boolean;
  allowInFlightFinalize: boolean;
} {
  if (accepting) return { rejectNew: false, allowInFlightFinalize: true };
  return { rejectNew: true, allowInFlightFinalize: hasInFlightReservation };
}

export function fourthFinalizedConnectionAllowed(finalizedCount: number, max = 3): boolean {
  return finalizedCount < max;
}

export function concurrentFinalSlotWinner(firstReserved: boolean, secondReserved: boolean): number {
  return Number(firstReserved) + Number(secondReserved);
}

export function lineItemPriceId(session: CheckoutSessionLike): string | null {
  const price = session.line_items?.data?.[0]?.price;
  return price?.id ?? null;
}

export function evaluateStripeSessionForFulfillment(input: {
  session: CheckoutSessionLike;
  expectedConnectionId: string;
  expectedProjectId: string;
  expectedContractorProfileId: string;
  alreadyConsumed?: boolean;
  alreadyUnlocked?: boolean;
  reservationActive?: boolean;
  occupiedAfterExpire?: number;
  hasSlot?: boolean;
  stripeTestMode?: boolean;
  connectionFeeCheckoutEnabled?: boolean;
  expectedPriceId?: string | null;
}): FulfillDecision {
  if (input.connectionFeeCheckoutEnabled === false) {
    return { ok: false, grant: false, reason: "connection_fee_checkout_disabled" };
  }
  const testMode = input.stripeTestMode !== false;
  const session = input.session;
  const livemodeReason = livemodeMismatchReason(session.livemode, testMode);
  if (livemodeReason) {
    return { ok: false, grant: false, reason: livemodeReason };
  }
  if (!session.id || !checkoutSessionIdMatchesMode(String(session.id), testMode)) {
    return { ok: false, grant: false, reason: "fake_or_mismatched_session" };
  }
  if (session.mode && session.mode !== "payment") {
    return { ok: false, grant: false, reason: "wrong_mode" };
  }
  const metadata = session.metadata ?? {};
  if (metadata.ppp_kind !== CONNECTION_CHECKOUT_KIND) {
    return { ok: false, grant: false, reason: "mismatched_metadata" };
  }
  if (metadata.connection_id !== input.expectedConnectionId) {
    return { ok: false, grant: false, reason: "mismatched_metadata" };
  }
  if (metadata.project_id !== input.expectedProjectId) {
    return { ok: false, grant: false, reason: "mismatched_metadata" };
  }
  if (metadata.contractor_profile_id !== input.expectedContractorProfileId) {
    return { ok: false, grant: false, reason: "mismatched_metadata" };
  }
  if (session.client_reference_id && session.client_reference_id !== input.expectedConnectionId) {
    return { ok: false, grant: false, reason: "mismatched_metadata" };
  }
  const expectedPriceId = (input.expectedPriceId ?? (testMode ? STRIPE_CONNECTION_PRICE_ID : "")).trim();
  if (!expectedPriceId.startsWith("price_")) {
    return { ok: false, grant: false, reason: "missing_price_id" };
  }
  const priceId = lineItemPriceId(session);
  if (!priceId) {
    return { ok: false, grant: false, reason: "missing_price_id" };
  }
  if (priceId !== expectedPriceId) {
    return { ok: false, grant: false, reason: "wrong_price_id", needsRefund: true };
  }
  const currency = (session.currency ?? session.line_items?.data?.[0]?.price?.currency ?? "").toLowerCase();
  if (currency && currency !== CONNECTION_FEE_CURRENCY) {
    return { ok: false, grant: false, reason: "wrong_currency", needsRefund: true };
  }
  const amount = session.amount_total ?? session.line_items?.data?.[0]?.amount_total ?? null;
  if (amount != null && amount !== CONNECTION_FEE_CENTS) {
    return { ok: false, grant: false, reason: "wrong_amount", needsRefund: true };
  }
  if (session.payment_status !== "paid") {
    return { ok: false, grant: false, reason: "unpaid" };
  }
  if (input.alreadyUnlocked && input.alreadyConsumed) {
    return { ok: true, grant: false, reason: "already_fulfilled" };
  }
  if (!input.reservationActive) {
    return { ok: false, grant: false, reason: "reservation_not_active", needsRefund: true };
  }
  if (input.hasSlot === false) {
    const reason = (input.occupiedAfterExpire ?? 0) >= 3 ? "connections_full" : "reservation_not_active";
    return { ok: false, grant: false, reason, needsRefund: true };
  }
  return { ok: true, grant: true, reason: "paid_valid_session" };
}

export function contactAfterFulfillment(granted: boolean): ContactAccessStatus {
  return granted ? "UNLOCKED" : "LOCKED";
}

export function entitlementFromFulfillment(granted: boolean): boolean {
  return connectionEntitlementAllowsReveal({
    status: contactAfterFulfillment(granted),
    revoked_at: null,
  });
}

export function webhookEventShouldFulfill(type: string, paymentStatus?: string): boolean {
  if (type === "checkout.session.async_payment_failed" || type === "checkout.session.expired") return false;
  if (type !== "checkout.session.completed" && type !== "checkout.session.async_payment_succeeded") return false;
  return paymentStatus === "paid";
}

export function webhookEventShouldExpire(type: string): boolean {
  return type === "checkout.session.expired" || type === "checkout.session.async_payment_failed";
}

export function duplicateWebhookIsHarmless(alreadyProcessedEventId: boolean, alreadyUnlocked: boolean): boolean {
  return alreadyProcessedEventId || alreadyUnlocked;
}

export function unauthenticatedCheckoutRejected(userId: string | null | undefined): boolean {
  return !userId;
}

/** Participate/accept is optional. Matched AVAILABLE or ACCEPTED opportunities may reserve. */
export function opportunityAllowsConnectionReserve(status: string | null | undefined): boolean {
  return status === "AVAILABLE" || status === "ACCEPTED";
}

export function ineligibleContractorRejected(input: {
  accountStatus?: string | null;
  approvalStatus?: string | null;
  hasMatchedOpportunity?: boolean;
  opportunityStatus?: string | null;
  projectCancelled?: boolean;
  isContractor?: boolean;
}): boolean {
  if (!input.isContractor) return true;
  if (input.accountStatus !== "ACTIVE") return true;
  if (input.approvalStatus !== "APPROVED") return true;
  if (input.projectCancelled) return true;
  if (input.hasMatchedOpportunity === false) return true;
  if (!opportunityAllowsConnectionReserve(input.opportunityStatus)) return true;
  return false;
}

export const FUNCTIONS_HTTP_ERROR_MESSAGE = "Edge Function returned a non-2xx status code";
export const CONNECTION_CHECKOUT_CUSTOMER_ERROR = "We couldn't start checkout. Please try again.";
export const CONNECTION_RECONCILE_CUSTOMER_ERROR = "We couldn't verify that payment. Please try again.";

function usableCheckoutErrorMessage(value: string): boolean {
  const trimmed = value.trim();
  if (!trimmed) return false;
  if (trimmed === FUNCTIONS_HTTP_ERROR_MESSAGE) return false;
  if (/edge function returned a non-2xx status code/i.test(trimmed)) return false;
  if (/failed to send a request to the edge function/i.test(trimmed)) return false;
  if (/relay error/i.test(trimmed)) return false;
  if (trimmed.length > 200) return false;
  return true;
}

/** Prefer `{ error: ... }` from the Edge Function JSON. Never return the raw FunctionsHttpError text. */
export function parseConnectionCheckoutErrorPayload(payload: unknown): string | null {
  if (typeof payload === "string") {
    const trimmed = payload.trim();
    if (!trimmed) return null;
    try {
      return parseConnectionCheckoutErrorPayload(JSON.parse(trimmed));
    } catch {
      return usableCheckoutErrorMessage(trimmed) ? trimmed : null;
    }
  }
  if (!payload || typeof payload !== "object") return null;
  const error = (payload as { error?: unknown }).error;
  if (typeof error === "string" && usableCheckoutErrorMessage(error)) return error.trim();
  return null;
}

async function readFunctionsErrorContext(context: unknown): Promise<unknown> {
  if (!context || typeof context !== "object") return context ?? null;
  const responseLike = context as {
    clone?: () => { json: () => Promise<unknown> };
    json?: () => Promise<unknown>;
  };
  try {
    if (typeof responseLike.clone === "function") {
      return await responseLike.clone().json();
    }
    if (typeof responseLike.json === "function") {
      return await responseLike.json();
    }
  } catch {
    return null;
  }
  return context;
}

export async function customerFacingConnectionCheckoutError(
  data: unknown,
  error?: { message?: string; context?: unknown } | null,
  fallback = CONNECTION_CHECKOUT_CUSTOMER_ERROR,
): Promise<string> {
  const fromData = parseConnectionCheckoutErrorPayload(data);
  if (fromData) return fromData;
  const fromContext = parseConnectionCheckoutErrorPayload(await readFunctionsErrorContext(error?.context));
  if (fromContext) return fromContext;
  return fallback;
}

export function allowedReturnOrigin(origin: string, siteUrl?: string | null): boolean {
  const value = origin.trim().replace(/\/$/, "");
  if (!value) return false;
  if (siteUrl && value === siteUrl.replace(/\/$/, "")) return true;
  try {
    const url = new URL(value);
    if (url.protocol === "http:" && (url.hostname === "localhost" || url.hostname === "127.0.0.1")) return true;
    if (url.protocol !== "https:") return false;
    if (url.username || url.password || url.search || url.hash) return false;
    return Boolean(url.hostname);
  } catch {
    return false;
  }
}

export function connectionCheckoutSuccessPath(): string {
  return "/app/pro/connections/return";
}

export function buildCheckoutUrls(origin: string, opportunityId: string): { successUrl: string; cancelUrl: string } {
  const base = origin.replace(/\/$/, "");
  return {
    successUrl: `${base}${connectionCheckoutSuccessPath()}?session_id={CHECKOUT_SESSION_ID}`,
    cancelUrl: `${base}/app/pro/opportunities/${encodeURIComponent(opportunityId)}`,
  };
}

export function stripeMetadataIsSafe(metadata: Record<string, string>): boolean {
  const forbidden = ["phone", "email", "street", "name", "first_name", "last_name", "lat", "lng"];
  return !forbidden.some((key) => key in metadata && metadata[key] != null && metadata[key] !== "");
}

export function trustedFulfillmentPathOnly(source: "success_url" | "webhook" | "reconcile"): boolean {
  return source === "webhook" || source === "reconcile";
}
