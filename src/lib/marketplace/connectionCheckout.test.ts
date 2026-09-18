import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { CONNECTION_FEE_CENTS } from "./types";
import {
  CONNECTION_CHECKOUT_KIND,
  CONNECTION_FEE_CHECKOUT_ENABLED,
  CONNECTION_FEE_CURRENCY,
  CONNECTION_RESERVATION_TTL_SECONDS,
  LEGACY_JOB_PAYMENT_FUNCTIONS,
  SIGNUP_FEE_FUNCTIONS_OWNED_BY_PR_12,
  STRIPE_ACTIVATION_PRICE_ID,
  STRIPE_CONNECTION_PRICE_ID,
  allowedReturnOrigin,
  buildCheckoutUrls,
  clientCannotSubstituteAmount,
  clientCannotSubstitutePriceId,
  concurrentFinalSlotWinner,
  contactAfterFulfillment,
  duplicateWebhookIsHarmless,
  entitlementFromFulfillment,
  evaluateStripeSessionForFulfillment,
  expiredReservationReleasesSpot,
  fakeSessionUnlocksContact,
  fourthFinalizedConnectionAllowed,
  CONNECTION_CHECKOUT_CUSTOMER_ERROR,
  FUNCTIONS_HTTP_ERROR_MESSAGE,
  customerFacingConnectionCheckoutError,
  ineligibleContractorRejected,
  opportunityAllowsConnectionReserve,
  queryParamPaidStateUnlocksContact,
  requireTestStripeSecret,
  reservationOccupiesSlot,
  serverConnectionPriceId,
  stopNewConnectionsRejectsCheckout,
  stripeMetadataIsSafe,
  successUrlUnlocksContact,
  trustedFulfillmentPathOnly,
  unauthenticatedCheckoutRejected,
  unpaidSessionUnlocksContact,
  webhookEventShouldExpire,
  webhookEventShouldFulfill,
} from "./connectionCheckout";
import { verifyStripeSignature } from "./stripeWebhook";
import { CONNECT_REDIRECTING_COPY, connectClickUnlocksContact } from "./connectionLifecycle";

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

function frontendSource(): string {
  const roots = [path.join(repoRoot, "src/pages"), path.join(repoRoot, "src/features"), path.join(repoRoot, "src/components")];
  return roots
    .flatMap((root) => walk(root))
    .filter((file) => /\.(ts|tsx)$/.test(file) && !/\.test\.(ts|tsx)$/.test(file))
    .map((file) => readFileSync(file, "utf8"))
    .join("\n");
}

const paidSession = {
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
  line_items: { data: [{ price: { id: STRIPE_CONNECTION_PRICE_ID, unit_amount: 499, currency: "usd" }, amount_total: 499 }] },
};

describe("Connection Fee TEST Checkout", () => {
  const sql = allSql();
  const latest = readFileSync(path.join(repoRoot, "supabase/migrations/20260927000001_connection_fee_checkout.sql"), "utf8");
  const fn = functionsSource();
  const ui = frontendSource();

  it("uses the server Connection Price ID and 499 USD", () => {
    expect(STRIPE_CONNECTION_PRICE_ID).toBe("price_1UH1RsPYJQAIQDv721IhjKS0");
    expect(serverConnectionPriceId("price_other")).toBe(STRIPE_CONNECTION_PRICE_ID);
    expect(CONNECTION_FEE_CENTS).toBe(499);
    expect(CONNECTION_FEE_CURRENCY).toBe("usd");
    expect(latest).toMatch(/SELECT 'price_1UH1RsPYJQAIQDv721IhjKS0'/);
    expect(latest).toMatch(/amount_cents integer NOT NULL DEFAULT 499/);
    expect(fn).toMatch(/price_1UH1RsPYJQAIQDv721IhjKS0/);
    expect(fn).toMatch(/line_items\[0\]\[price\]/);
  });

  it("rejects client substitution of price, amount, contractor, or foreign project", () => {
    expect(clientCannotSubstitutePriceId("price_hack")).toBe(false);
    expect(clientCannotSubstituteAmount(1999)).toBe(false);
    expect(fn).toMatch(/client cannot set price, amount, or contractor/);
    expect(latest).toMatch(/p_auth_user_id/);
    expect(fn).toMatch(/body\.contractor_profile_id/);
  });

  it("rejects unauthenticated and ineligible contractors", () => {
    expect(unauthenticatedCheckoutRejected(null)).toBe(true);
    expect(ineligibleContractorRejected({ isContractor: true, accountStatus: "ACTIVE", approvalStatus: "PENDING", opportunityStatus: "AVAILABLE" })).toBe(true);
    expect(ineligibleContractorRejected({ isContractor: true, accountStatus: "ACTIVE", approvalStatus: "APPROVED", hasMatchedOpportunity: false })).toBe(true);
    expect(latest).toMatch(/RAISE EXCEPTION 'auth required'/);
    expect(latest).toMatch(/RAISE EXCEPTION 'ineligible contractor'/);
    expect(fn).toMatch(/not signed in/);
  });

  it("lets a matched contractor reserve with AVAILABLE or ACCEPTED, and rejects unmatched/passed/cancelled", () => {
    const reserve = functionBody(sql, "reserve_connection_checkout");
    expect(opportunityAllowsConnectionReserve("AVAILABLE")).toBe(true);
    expect(opportunityAllowsConnectionReserve("ACCEPTED")).toBe(true);
    expect(opportunityAllowsConnectionReserve("PASSED")).toBe(false);
    expect(opportunityAllowsConnectionReserve("EXPIRED")).toBe(false);
    expect(opportunityAllowsConnectionReserve("CLOSED")).toBe(false);
    expect(opportunityAllowsConnectionReserve(null)).toBe(false);
    expect(
      ineligibleContractorRejected({
        isContractor: true,
        accountStatus: "ACTIVE",
        approvalStatus: "APPROVED",
        hasMatchedOpportunity: true,
        opportunityStatus: "AVAILABLE",
      }),
    ).toBe(false);
    expect(
      ineligibleContractorRejected({
        isContractor: true,
        accountStatus: "ACTIVE",
        approvalStatus: "APPROVED",
        hasMatchedOpportunity: true,
        opportunityStatus: "ACCEPTED",
      }),
    ).toBe(false);
    expect(
      ineligibleContractorRejected({
        isContractor: true,
        accountStatus: "ACTIVE",
        approvalStatus: "APPROVED",
        hasMatchedOpportunity: false,
        opportunityStatus: "AVAILABLE",
      }),
    ).toBe(true);
    expect(
      ineligibleContractorRejected({
        isContractor: true,
        accountStatus: "ACTIVE",
        approvalStatus: "APPROVED",
        hasMatchedOpportunity: true,
        opportunityStatus: "PASSED",
      }),
    ).toBe(true);
    expect(
      ineligibleContractorRejected({
        isContractor: true,
        accountStatus: "ACTIVE",
        approvalStatus: "APPROVED",
        hasMatchedOpportunity: true,
        opportunityStatus: "AVAILABLE",
        projectCancelled: true,
      }),
    ).toBe(true);
    expect(reserve).toMatch(/FLAT-499: matched opportunity may be AVAILABLE or ACCEPTED/);
    expect(reserve).toMatch(/AND o\.contractor_profile_id = contractor_id\s+AND o\.status IN \('AVAILABLE', 'ACCEPTED'\)/);
    expect(reserve).toMatch(/RAISE EXCEPTION 'project is cancelled'/);
    expect(reserve).toMatch(/require_service_role/);
    expect(reserve).toMatch(/IF occupied >= 3 THEN/);
    expect(reserve).not.toMatch(/INSERT INTO public\.booking_contact_access/);
  });

  it("does not surface the raw FunctionsHttpError text to contractors", async () => {
    const api = readFileSync(path.join(repoRoot, "src/lib/marketplace/api.ts"), "utf8");
    expect(api).toMatch(/customerFacingConnectionCheckoutError/);
    expect(api).toMatch(/create-connection-checkout failed/);
    expect(api).not.toMatch(/Could not start Connection Fee checkout/);
    expect(api).not.toMatch(/asError\(error, "Could not start Connection Fee checkout\."\)/);
    await expect(
      customerFacingConnectionCheckoutError(
        { error: "ineligible contractor", contact_unlocked: false },
        { message: FUNCTIONS_HTTP_ERROR_MESSAGE },
      ),
    ).resolves.toBe("ineligible contractor");
    await expect(
      customerFacingConnectionCheckoutError(null, {
        message: FUNCTIONS_HTTP_ERROR_MESSAGE,
        context: new Response(JSON.stringify({ error: "connections full" }), {
          status: 400,
          headers: { "Content-Type": "application/json" },
        }),
      }),
    ).resolves.toBe("connections full");
    await expect(
      customerFacingConnectionCheckoutError(null, { message: FUNCTIONS_HTTP_ERROR_MESSAGE }),
    ).resolves.toBe(CONNECTION_CHECKOUT_CUSTOMER_ERROR);
    await expect(customerFacingConnectionCheckoutError({ error: FUNCTIONS_HTTP_ERROR_MESSAGE })).resolves.toBe(
      CONNECTION_CHECKOUT_CUSTOMER_ERROR,
    );
    expect(CONNECTION_CHECKOUT_CUSTOMER_ERROR).toBe("We couldn't start checkout. Please try again.");
  });

  it("rejects closed and full projects and duplicate contractor+project pairs", () => {
    expect(stopNewConnectionsRejectsCheckout(false, false).rejectNew).toBe(true);
    expect(fourthFinalizedConnectionAllowed(3)).toBe(false);
    expect(latest).toMatch(/customer stopped new connections/);
    expect(latest).toMatch(/connections full/);
    expect(latest).toMatch(/duplicate connection/);
    expect(latest).toMatch(/project_connections_active_pair_idx/);
  });

  it("releases abandoned and expired reservations so they do not permanently consume a spot", () => {
    const now = new Date("2026-09-18T12:00:00Z");
    expect(expiredReservationReleasesSpot("RESERVED", "2026-09-18T11:00:00Z", now)).toBe(true);
    expect(reservationOccupiesSlot("RESERVED", "2026-09-18T11:00:00Z", now)).toBe(false);
    expect(reservationOccupiesSlot("RESERVED", "2026-09-18T13:00:00Z", now)).toBe(true);
    expect(CONNECTION_RESERVATION_TTL_SECONDS).toBe(1800);
    expect(latest).toMatch(/expire_stale_connection_reservations/);
    expect(latest).toMatch(/status = 'EXPIRED'/);
    expect(latest).toMatch(/DELETE FROM public\.connection_slots WHERE connection_id/);
  });

  it("enforces max 3 finalized connections and concurrent final-slot protection", () => {
    expect(fourthFinalizedConnectionAllowed(2)).toBe(true);
    expect(fourthFinalizedConnectionAllowed(3)).toBe(false);
    expect(concurrentFinalSlotWinner(true, false)).toBe(1);
    expect(latest).toMatch(/IF occupied >= 3 THEN/);
    expect(latest).toMatch(/EXCEPTION WHEN unique_violation THEN/);
    expect(latest).toMatch(/FOR UPDATE/);
  });

  it("never unlocks from the success URL, fake session, or unpaid session", () => {
    expect(successUrlUnlocksContact("session_id=cs_test_abc&paid=1")).toBe(false);
    expect(queryParamPaidStateUnlocksContact("true")).toBe(false);
    expect(fakeSessionUnlocksContact()).toBe(false);
    expect(unpaidSessionUnlocksContact()).toBe(false);
    expect(connectClickUnlocksContact()).toBe(false);
    expect(trustedFulfillmentPathOnly("success_url")).toBe(false);
    expect(trustedFulfillmentPathOnly("webhook")).toBe(true);
    expect(
      evaluateStripeSessionForFulfillment({
        session: { ...paidSession, id: "cs_live_nope" },
        expectedConnectionId: "conn-1",
        expectedProjectId: "proj-1",
        expectedContractorProfileId: "pro-1",
        reservationActive: true,
        hasSlot: true,
      }).grant,
    ).toBe(false);
    expect(
      evaluateStripeSessionForFulfillment({
        session: { ...paidSession, payment_status: "unpaid" },
        expectedConnectionId: "conn-1",
        expectedProjectId: "proj-1",
        expectedContractorProfileId: "pro-1",
        reservationActive: true,
        hasSlot: true,
      }).reason,
    ).toBe("unpaid");
  });

  it("unlocks only via a trusted paid session on the server path", () => {
    const decision = evaluateStripeSessionForFulfillment({
      session: paidSession,
      expectedConnectionId: "conn-1",
      expectedProjectId: "proj-1",
      expectedContractorProfileId: "pro-1",
      reservationActive: true,
      hasSlot: true,
      stripeTestMode: true,
      connectionFeeCheckoutEnabled: true,
    });
    expect(decision).toEqual({ ok: true, grant: true, reason: "paid_valid_session" });
    expect(contactAfterFulfillment(true)).toBe("UNLOCKED");
    expect(entitlementFromFulfillment(true)).toBe(true);
    expect(entitlementFromFulfillment(false)).toBe(false);
    expect(sql).toMatch(/grant_source = 'CONNECTION_FEE_PAYMENT'|grant_source, 'CONNECTION_FEE_PAYMENT'/);
    expect(sql).toMatch(/grant_booking_contact_access_from_connection_fee/);
    expect(sql).toMatch(/'UNLOCKED'/);
  });

  it("requires a webhook signature and treats duplicate/replay as harmless", () => {
    expect(latest).toMatch(/processor_event_id text NOT NULL UNIQUE/);
    expect(fn).toMatch(/invalid signature/);
    expect(fn).toMatch(/STRIPE_WEBHOOK_SECRET/);
    expect(duplicateWebhookIsHarmless(true, false)).toBe(true);
    expect(duplicateWebhookIsHarmless(false, true)).toBe(true);
    expect(webhookEventShouldFulfill("checkout.session.completed", "paid")).toBe(true);
    expect(webhookEventShouldFulfill("checkout.session.completed", "unpaid")).toBe(false);
    expect(webhookEventShouldExpire("checkout.session.expired")).toBe(true);
  });

  it("rejects mismatched metadata and wrong Price ID / amount / currency", () => {
    expect(
      evaluateStripeSessionForFulfillment({
        session: { ...paidSession, metadata: { ...paidSession.metadata, project_id: "other" } },
        expectedConnectionId: "conn-1",
        expectedProjectId: "proj-1",
        expectedContractorProfileId: "pro-1",
        reservationActive: true,
        hasSlot: true,
      }).reason,
    ).toBe("mismatched_metadata");
    expect(
      evaluateStripeSessionForFulfillment({
        session: { ...paidSession, amount_total: 999 },
        expectedConnectionId: "conn-1",
        expectedProjectId: "proj-1",
        expectedContractorProfileId: "pro-1",
        reservationActive: true,
        hasSlot: true,
      }).reason,
    ).toBe("wrong_amount");
    expect(
      evaluateStripeSessionForFulfillment({
        session: { ...paidSession, currency: "cad" },
        expectedConnectionId: "conn-1",
        expectedProjectId: "proj-1",
        expectedContractorProfileId: "pro-1",
        reservationActive: true,
        hasSlot: true,
      }).reason,
    ).toBe("wrong_currency");
    expect(
      evaluateStripeSessionForFulfillment({
        session: {
          ...paidSession,
          line_items: { data: [{ price: { id: STRIPE_ACTIVATION_PRICE_ID, unit_amount: 499, currency: "usd" } }] },
        },
        expectedConnectionId: "conn-1",
        expectedProjectId: "proj-1",
        expectedContractorProfileId: "pro-1",
        reservationActive: true,
        hasSlot: true,
      }).reason,
    ).toBe("wrong_price_id");
  });

  it("keeps #14 LOCKED before fulfillment and UNLOCKED only after trusted grant", () => {
    expect(contactAfterFulfillment(false)).toBe("LOCKED");
    expect(sql).toMatch(/CREATE TABLE public\.booking_contact_access/);
    expect(sql).toMatch(/DROP TABLE IF EXISTS public\.connection_contact_access/);
    expect(sql).toMatch(/grant_booking_contact_access_from_connection_fee/);
    const fulfill = functionBody(sql, "fulfill_connection_fee_checkout");
    const reserve = functionBody(sql, "reserve_connection_checkout");
    expect(fulfill).toMatch(/grant_booking_contact_access_from_connection_fee/);
    expect(fulfill).toMatch(/status = 'PAID'/);
    expect(fulfill).toMatch(/needs_refund/);
    expect(fulfill).not.toMatch(/connection_contact_access/);
    expect(reserve).not.toMatch(/INSERT INTO public\.booking_contact_access/);
    expect(reserve).not.toMatch(/connection_contact_access/);
  });

  it("does not invoke old Connect or job-payment functions and keeps payment flags safe", () => {
    expect(CONNECTION_FEE_CHECKOUT_ENABLED).toBe(false);
    expect(latest).toMatch(/'connection_fee_checkout_enabled',\s*0/);
    expect(latest).not.toMatch(/payments_live',\s*1/);
    expect(latest).not.toMatch(/charges_live',\s*1/);
    expect(latest).not.toMatch(/signup_fee_enabled',\s*1/);
    for (const name of LEGACY_JOB_PAYMENT_FUNCTIONS) {
      expect(fn).not.toMatch(new RegExp(`functions/v1/${name}`));
      expect(fn).not.toMatch(new RegExp(`rpc\\("${name.replace(/-/g, "_")}"`));
    }
    expect(fn).not.toMatch(/create-payment-intent|create-connect-account-link|create-transfer|create-refund/);
    expect(fn).not.toMatch(/transfer_data|application_fee|destination_charge/);
    expect(SIGNUP_FEE_FUNCTIONS_OWNED_BY_PR_12.every((name) => !fn.includes(name))).toBe(true);
    expect(requireTestStripeSecret("sk_test_1234567890abcd")).toBe("sk_test_1234567890abcd");
    expect(() => requireTestStripeSecret("sk_live_1234567890abcd")).toThrow(/TEST/);
  });

  it("builds mobile checkout URLs without putting private contact in Stripe metadata", () => {
    const urls = buildCheckoutUrls("http://localhost:5173", "11111111-1111-4111-8111-111111111111");
    expect(urls.successUrl).toMatch(/\/app\/pro\/connections\/return\?session_id=\{CHECKOUT_SESSION_ID\}/);
    expect(allowedReturnOrigin("http://127.0.0.1:5173")).toBe(true);
    expect(stripeMetadataIsSafe({ ppp_kind: "connection_fee", connection_id: "x", project_id: "y" })).toBe(true);
    expect(stripeMetadataIsSafe({ phone: "555-0100", ppp_kind: "connection_fee" })).toBe(false);
    expect(ui).toMatch(/w-full max-w-\[390px\]/);
    expect(CONNECT_REDIRECTING_COPY).toMatch(/Continuing to \$4\.99 checkout/);
    expect(ui).toMatch(/startConnectionCheckout/);
  });
});

describe("Stripe webhook signatures", () => {
  it("rejects missing or invalid signatures", async () => {
    expect(await verifyStripeSignature("{}", "", "whsec_testsecret_1234")).toBe(false);
    expect(await verifyStripeSignature("{}", "t=1,v1=deadbeef", "not-a-webhook-secret")).toBe(false);
  });
});
