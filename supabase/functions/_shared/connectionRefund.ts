/**
 * Automatic refund of a $4.99 Connection Fee that was paid but could not be provided.
 *
 * Safety rules:
 *  - The database decides whether a session is refundable (prepare_connection_fee_refund). It never refunds
 *    the session that delivered a PAID connection, and holds one row per Checkout session (UNIQUE).
 *  - Each Stripe call carries an Idempotency-Key derived from the Checkout session id and attempt number.
 *  - Before any create, existing refunds on the PaymentIntent are listed. A live (non-failed, non-canceled)
 *    refund is recorded instead of creating a second one. Stripe also caps refunds at the amount charged.
 *  - The refund amount is always the server constant 499 cents. Nothing from the client sets it.
 */
import { connectionFeeCents } from "./stripeEnv.ts";

export type RpcFn = (name: string, args: Record<string, unknown>) => Promise<{ data: unknown; error: string | null }>;

export type StripeRefundLike = {
  id?: string;
  object?: string;
  status?: string;
  amount?: number;
  payment_intent?: string | { id?: string } | null;
  metadata?: Record<string, string> | null;
};

export type StripeRefundApi = {
  listRefunds: (paymentIntentId: string) => Promise<StripeRefundLike[]>;
  createRefund: (params: Record<string, string>, idempotencyKey: string) => Promise<StripeRefundLike>;
};

export type RefundOutcome = {
  refund: boolean;
  proceeded: boolean;
  status: string | null;
  refund_id: string | null;
  stripe_refund_id: string | null;
  reason: string | null;
  error: string | null;
};

export const CONNECTION_REFUND_METADATA_KIND = "connection_fee_refund";

export function refundIdempotencyKey(checkoutSessionId: string, attempt: number): string {
  const id = checkoutSessionId.trim();
  if (!id.startsWith("cs_")) throw new Error("refund needs a Stripe Checkout session id");
  if (!Number.isInteger(attempt) || attempt < 1) throw new Error("refund attempt must be a positive integer");
  return `ppp_conn_refund_${id}_a${attempt}`;
}

/** A refund that already exists for this PaymentIntent and still counts (pending or done). */
export function reusableRefund(refunds: StripeRefundLike[]): StripeRefundLike | null {
  for (const refund of refunds) {
    const status = String(refund.status ?? "").toLowerCase();
    if (!String(refund.id ?? "").startsWith("re_")) continue;
    if (status === "failed" || status === "canceled") continue;
    return refund;
  }
  return null;
}

export function refundCreateParams(input: {
  paymentIntentId: string;
  checkoutSessionId: string;
  connectionId: string | null;
  refundRowId: string;
  reason: string;
}): Record<string, string> {
  if (!input.paymentIntentId.startsWith("pi_")) throw new Error("refund needs a Stripe PaymentIntent id");
  return {
    payment_intent: input.paymentIntentId,
    amount: String(connectionFeeCents()),
    reason: input.reason === "duplicate_payment" ? "duplicate" : "requested_by_customer",
    "metadata[ppp_kind]": CONNECTION_REFUND_METADATA_KIND,
    "metadata[checkout_session_id]": input.checkoutSessionId,
    "metadata[connection_id]": input.connectionId ?? "",
    "metadata[refund_row_id]": input.refundRowId,
    "metadata[ppp_reason]": input.reason.slice(0, 200),
  };
}

function idOf(value: unknown): string | null {
  if (typeof value === "string") return value;
  if (value && typeof value === "object" && "id" in value) return String((value as { id?: unknown }).id ?? "") || null;
  return null;
}

export async function refundConnectionFeeIfNeeded(
  rpc: RpcFn,
  stripe: StripeRefundApi,
  input: {
    checkoutSessionId: string;
    paymentIntentId: string | null;
    amountCents: number;
    currency: string;
    livemode: boolean;
    reason?: string | null;
    auto?: boolean;
  },
): Promise<RefundOutcome> {
  const prepared = await rpc("prepare_connection_fee_refund", {
    p_stripe_checkout_session_id: input.checkoutSessionId,
    p_stripe_payment_intent_id: input.paymentIntentId,
    p_amount_cents: input.amountCents,
    p_currency: input.currency,
    p_livemode: input.livemode,
    p_reason: input.reason ?? null,
    p_auto: input.auto ?? true,
  });
  if (prepared.error) {
    return { refund: true, proceeded: false, status: null, refund_id: null, stripe_refund_id: null, reason: input.reason ?? null, error: prepared.error };
  }
  const plan = (prepared.data ?? {}) as {
    refund?: boolean;
    proceed?: boolean;
    refund_id?: string;
    status?: string;
    stripe_refund_id?: string | null;
    idempotency_key?: string;
    attempt?: number;
    stripe_payment_intent_id?: string | null;
    connection_id?: string | null;
    reason?: string | null;
  };
  const base = {
    refund: plan.refund === true,
    status: plan.status ?? null,
    refund_id: plan.refund_id ?? null,
    stripe_refund_id: plan.stripe_refund_id ?? null,
    reason: plan.reason ?? null,
  };
  if (plan.refund !== true || plan.proceed !== true) {
    return { ...base, proceeded: false, error: null };
  }

  const refundRowId = String(plan.refund_id ?? "");
  const paymentIntentId = String(plan.stripe_payment_intent_id ?? "");
  const attempt = Number(plan.attempt ?? 0);
  let refund: StripeRefundLike | null = null;
  let stripeError: string | null = null;
  try {
    const key = refundIdempotencyKey(input.checkoutSessionId, attempt);
    if (plan.idempotency_key && plan.idempotency_key !== key) throw new Error("refund idempotency key mismatch");
    refund = reusableRefund(await stripe.listRefunds(paymentIntentId));
    if (!refund) {
      refund = await stripe.createRefund(
        refundCreateParams({
          paymentIntentId,
          checkoutSessionId: input.checkoutSessionId,
          connectionId: plan.connection_id ?? null,
          refundRowId,
          reason: String(plan.reason ?? "needs_refund"),
        }),
        key,
      );
    }
  } catch (err) {
    stripeError = err instanceof Error ? err.message : "Stripe refund failed";
  }

  const recorded = await rpc("record_connection_fee_refund_result", {
    p_refund_id: refundRowId,
    p_stripe_refund_id: refund?.id ?? null,
    p_stripe_status: refund?.status ?? null,
    p_amount_cents: refund?.amount ?? null,
    p_error: stripeError,
  });
  const row = (recorded.data ?? {}) as { status?: string; stripe_refund_id?: string | null };
  return {
    ...base,
    proceeded: true,
    status: row.status ?? (stripeError ? "FAILED" : base.status),
    stripe_refund_id: row.stripe_refund_id ?? refund?.id ?? null,
    error: stripeError ?? recorded.error,
  };
}

/** A Stripe refund event that belongs to an automatic Connection Fee refund. */
export function isConnectionRefundObject(obj: Record<string, unknown>): boolean {
  const metadata = (obj.metadata ?? {}) as Record<string, string>;
  return obj.object === "refund" && metadata.ppp_kind === CONNECTION_REFUND_METADATA_KIND;
}

export async function recordRefundVerification(
  rpc: RpcFn,
  refund: StripeRefundLike,
  source: string,
): Promise<{ data: unknown; error: string | null }> {
  return rpc("record_connection_fee_refund_verification", {
    p_stripe_refund_id: String(refund.id ?? ""),
    p_stripe_status: String(refund.status ?? ""),
    p_amount_cents: Number(refund.amount ?? 0),
    p_stripe_payment_intent_id: idOf(refund.payment_intent),
    p_source: source,
  });
}

/** For integrity failures recorded as MANUAL_REVIEW: the database never asks for a Stripe call. */
export const manualReviewOnly: StripeRefundApi = {
  listRefunds: () => Promise.reject(new Error("manual review only: no Stripe call")),
  createRefund: () => Promise.reject(new Error("manual review only: no Stripe call")),
};

/** Stripe REST implementation. Only used by edge functions; tests pass a mock. */
export function stripeRefundApi(secret: string, fetchImpl: typeof fetch = fetch): StripeRefundApi {
  async function parse(res: Response): Promise<Record<string, unknown>> {
    const data = (await res.json()) as Record<string, unknown>;
    if (!res.ok) {
      const err = data.error as { message?: string } | undefined;
      throw new Error(err?.message ? String(err.message) : "Stripe request failed");
    }
    return data;
  }
  return {
    async listRefunds(paymentIntentId) {
      const res = await fetchImpl(
        `https://api.stripe.com/v1/refunds?payment_intent=${encodeURIComponent(paymentIntentId)}&limit=10`,
        { headers: { Authorization: `Bearer ${secret}` } },
      );
      const data = await parse(res);
      return (data.data as StripeRefundLike[] | undefined) ?? [];
    },
    async createRefund(params, idempotencyKey) {
      const res = await fetchImpl("https://api.stripe.com/v1/refunds", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${secret}`,
          "Content-Type": "application/x-www-form-urlencoded",
          "Idempotency-Key": idempotencyKey,
        },
        body: new URLSearchParams(params),
      });
      return (await parse(res)) as StripeRefundLike;
    },
  };
}
