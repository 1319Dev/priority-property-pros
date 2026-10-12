import { describe, expect, it, vi } from "vitest";
import {
  CONNECTION_REFUND_METADATA_KIND,
  isConnectionRefundObject,
  manualReviewOnly,
  recordRefundVerification,
  refundConnectionFeeIfNeeded,
  refundCreateParams,
  refundIdempotencyKey,
  reusableRefund,
  stripeRefundApi,
  type RpcFn,
  type StripeRefundApi,
} from "../../../supabase/functions/_shared/connectionRefund.ts";
import {
  CONNECTION_CHECKOUT_BLOCK_REASONS,
  connectionCheckoutBlockedMessage,
} from "../../../supabase/functions/_shared/connectionCheckoutBlock.ts";

const SESSION = "cs_test_a1B2c3";
const PI = "pi_test_123";

function rpcMock(plan: Record<string, unknown>, recordStatus = "SUCCEEDED") {
  const calls: Array<{ name: string; args: Record<string, unknown> }> = [];
  const rpc: RpcFn = async (name, args) => {
    calls.push({ name, args });
    if (name === "prepare_connection_fee_refund") return { data: plan, error: null };
    if (name === "record_connection_fee_refund_result") {
      return { data: { status: args.p_stripe_refund_id ? recordStatus : "FAILED", stripe_refund_id: args.p_stripe_refund_id }, error: null };
    }
    return { data: null, error: `unexpected ${name}` };
  };
  return { rpc, calls };
}

function stripeMock(existing: Array<Record<string, unknown>> = [], create?: () => Promise<Record<string, unknown>>) {
  const listRefunds = vi.fn(async () => existing);
  const createRefund = vi.fn(
    async (params: Record<string, string>, key: string): Promise<Record<string, unknown>> => {
      void params;
      void key;
      return create ? create() : { id: "re_test_1", status: "succeeded", amount: 499 };
    },
  );
  return { api: { listRefunds, createRefund } as unknown as StripeRefundApi, listRefunds, createRefund };
}

const proceedPlan = {
  refund: true,
  proceed: true,
  refund_id: "11111111-1111-4111-8111-111111111111",
  attempt: 1,
  idempotency_key: `ppp_conn_refund_${SESSION}_a1`,
  stripe_payment_intent_id: PI,
  connection_id: "22222222-2222-4222-8222-222222222222",
  reason: "paid_but_reservation_not_active",
  status: "PENDING",
};

const input = { checkoutSessionId: SESSION, paymentIntentId: PI, amountCents: 499, currency: "usd", livemode: false };

describe("Connection Fee automatic refunds (Stripe mocked, never called live)", () => {
  it("builds a deterministic idempotency key from the Checkout session and attempt", () => {
    expect(refundIdempotencyKey(SESSION, 1)).toBe(`ppp_conn_refund_${SESSION}_a1`);
    expect(refundIdempotencyKey(SESSION, 2)).toBe(`ppp_conn_refund_${SESSION}_a2`);
    expect(() => refundIdempotencyKey("pi_123", 1)).toThrow(/Checkout session/);
    expect(() => refundIdempotencyKey(SESSION, 0)).toThrow(/positive/);
  });

  it("always refunds exactly 499 cents of the PaymentIntent and tags the refund", () => {
    const params = refundCreateParams({
      paymentIntentId: PI,
      checkoutSessionId: SESSION,
      connectionId: "c1",
      refundRowId: "r1",
      reason: "duplicate_payment",
    });
    expect(params.amount).toBe("499");
    expect(params.payment_intent).toBe(PI);
    expect(params.reason).toBe("duplicate");
    expect(params["metadata[ppp_kind]"]).toBe(CONNECTION_REFUND_METADATA_KIND);
    expect(refundCreateParams({ paymentIntentId: PI, checkoutSessionId: SESSION, connectionId: null, refundRowId: "r", reason: "x" }).reason)
      .toBe("requested_by_customer");
    expect(() => refundCreateParams({ paymentIntentId: "ch_1", checkoutSessionId: SESSION, connectionId: null, refundRowId: "r", reason: "x" }))
      .toThrow(/PaymentIntent/);
  });

  it("does nothing when the database says no refund is needed (normal successful payment)", async () => {
    const { rpc, calls } = rpcMock({ refund: false, proceed: false, reason: null });
    const stripe = stripeMock();
    const out = await refundConnectionFeeIfNeeded(rpc, stripe.api, input);
    expect(out.refund).toBe(false);
    expect(out.proceeded).toBe(false);
    expect(stripe.listRefunds).not.toHaveBeenCalled();
    expect(stripe.createRefund).not.toHaveBeenCalled();
    expect(calls.map((c) => c.name)).toEqual(["prepare_connection_fee_refund"]);
  });

  it("refunds once with the Idempotency-Key and records the Stripe refund id", async () => {
    const { rpc, calls } = rpcMock(proceedPlan);
    const stripe = stripeMock();
    const out = await refundConnectionFeeIfNeeded(rpc, stripe.api, input);
    expect(stripe.listRefunds).toHaveBeenCalledWith(PI);
    expect(stripe.createRefund).toHaveBeenCalledTimes(1);
    expect(stripe.createRefund.mock.calls[0][1]).toBe(`ppp_conn_refund_${SESSION}_a1`);
    expect(out).toMatchObject({ refund: true, proceeded: true, status: "SUCCEEDED", stripe_refund_id: "re_test_1", error: null });
    const record = calls.find((c) => c.name === "record_connection_fee_refund_result");
    expect(record?.args).toMatchObject({ p_stripe_refund_id: "re_test_1", p_stripe_status: "succeeded", p_amount_cents: 499, p_error: null });
  });

  it("reuses an existing Stripe refund on the PaymentIntent instead of creating a second one", async () => {
    const { rpc } = rpcMock({ ...proceedPlan, attempt: 2, idempotency_key: `ppp_conn_refund_${SESSION}_a2` });
    const stripe = stripeMock([
      { id: "re_failed", status: "failed", amount: 499 },
      { id: "re_existing", status: "pending", amount: 499 },
    ]);
    const out = await refundConnectionFeeIfNeeded(rpc, stripe.api, input);
    expect(stripe.createRefund).not.toHaveBeenCalled();
    expect(out.stripe_refund_id).toBe("re_existing");
  });

  it("records a failure (no refund id) so the webhook can answer 500 and Stripe retries", async () => {
    const { rpc, calls } = rpcMock(proceedPlan);
    const stripe = stripeMock([], async () => {
      throw new Error("api_connection_error");
    });
    const out = await refundConnectionFeeIfNeeded(rpc, stripe.api, input);
    expect(out.error).toBe("api_connection_error");
    expect(out.status).toBe("FAILED");
    const record = calls.find((c) => c.name === "record_connection_fee_refund_result");
    expect(record?.args).toMatchObject({ p_stripe_refund_id: null, p_error: "api_connection_error" });
  });

  it("never calls Stripe while another attempt is in progress, already succeeded, or needs manual review", async () => {
    for (const plan of [
      { refund: true, proceed: false, in_progress: true, status: "PENDING" },
      { refund: true, proceed: false, status: "SUCCEEDED", stripe_refund_id: "re_done" },
      { refund: true, proceed: false, status: "MANUAL_REVIEW" },
    ]) {
      const { rpc } = rpcMock(plan);
      const stripe = stripeMock();
      const out = await refundConnectionFeeIfNeeded(rpc, stripe.api, input);
      expect(out.refund).toBe(true);
      expect(out.proceeded).toBe(false);
      expect(stripe.listRefunds).not.toHaveBeenCalled();
      expect(stripe.createRefund).not.toHaveBeenCalled();
    }
  });

  it("refuses a database plan whose idempotency key does not match the session and attempt", async () => {
    const { rpc } = rpcMock({ ...proceedPlan, idempotency_key: "ppp_conn_refund_cs_test_other_a1" });
    const stripe = stripeMock();
    const out = await refundConnectionFeeIfNeeded(rpc, stripe.api, input);
    expect(out.error).toMatch(/idempotency key mismatch/);
    expect(stripe.createRefund).not.toHaveBeenCalled();
  });

  it("passes integrity failures to the database as manual review with no Stripe call", async () => {
    const { rpc, calls } = rpcMock({ refund: true, proceed: false, status: "MANUAL_REVIEW" });
    const out = await refundConnectionFeeIfNeeded(rpc, manualReviewOnly, { ...input, reason: "wrong_amount", auto: false });
    expect(out.status).toBe("MANUAL_REVIEW");
    expect(calls[0].args).toMatchObject({ p_reason: "wrong_amount", p_auto: false });
    await expect(manualReviewOnly.createRefund({}, "k")).rejects.toThrow(/manual review only/);
  });

  it("only treats refund objects tagged connection_fee_refund as ours", () => {
    expect(isConnectionRefundObject({ object: "refund", metadata: { ppp_kind: "connection_fee_refund" } })).toBe(true);
    expect(isConnectionRefundObject({ object: "refund", metadata: { ppp_kind: "signup_fee" } })).toBe(false);
    expect(isConnectionRefundObject({ object: "checkout.session", metadata: { ppp_kind: "connection_fee_refund" } })).toBe(false);
    expect(reusableRefund([{ id: "re_x", status: "canceled" }])).toBeNull();
  });

  it("forwards Stripe's view of a refund to the verification RPC", async () => {
    const seen: Record<string, unknown>[] = [];
    const rpc: RpcFn = async (_n, args) => {
      seen.push(args);
      return { data: { found: true }, error: null };
    };
    await recordRefundVerification(rpc, { id: "re_1", status: "succeeded", amount: 499, payment_intent: { id: PI } }, "webhook:refund.updated");
    expect(seen[0]).toMatchObject({ p_stripe_refund_id: "re_1", p_stripe_status: "succeeded", p_amount_cents: 499, p_stripe_payment_intent_id: PI });
  });

  it("sends the Idempotency-Key header to the Stripe refunds endpoint (fetch mocked)", async () => {
    const fetchMock = vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
      void url;
      void init;
      return new Response(JSON.stringify({ id: "re_mock", status: "pending", amount: 499 }), { status: 200 });
    });
    const api = stripeRefundApi("sk_test_mock", fetchMock as unknown as typeof fetch);
    await api.createRefund({ payment_intent: PI, amount: "499" }, "ppp_conn_refund_cs_test_x_a1");
    const [url, init] = fetchMock.mock.calls[0];
    expect(String(url)).toBe("https://api.stripe.com/v1/refunds");
    expect((init?.headers as Record<string, string>)["Idempotency-Key"]).toBe("ppp_conn_refund_cs_test_x_a1");
  });

  it("explains every blocked-checkout reason and says no charge was made", () => {
    for (const reason of CONNECTION_CHECKOUT_BLOCK_REASONS) {
      expect(connectionCheckoutBlockedMessage(reason)).toMatch(/not been charged/);
    }
    expect(connectionCheckoutBlockedMessage(null)).toMatch(/not been charged/);
  });
});
