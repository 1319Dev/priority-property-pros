import { getSupabaseClient } from "../supabase/client";
import type { RpcJson } from "../marketplace/api";
import type { ContractorStripeAccount, PaymentScheduleItem } from "./types";

function client() {
  const supabase = getSupabaseClient();
  if (!supabase) throw new Error("Supabase is not configured yet.");
  return supabase;
}

function asError(error: { message: string } | null, fallback: string): string {
  return error?.message || fallback;
}

export function appAbsoluteUrl(path: string): string {
  const base = import.meta.env.BASE_URL.endsWith("/") ? import.meta.env.BASE_URL : `${import.meta.env.BASE_URL}/`;
  const trimmed = path.replace(/^\//, "");
  return `${window.location.origin}${base}${trimmed}`;
}

export async function fetchBookingPaymentOverview(bookingId: string): Promise<RpcJson> {
  await client().rpc("ensure_payment_schedule", { p_booking_id: bookingId });
  const { data, error } = await client().rpc("booking_payment_overview", { p_booking_id: bookingId });
  if (error) throw new Error(asError(error, "Could not load the payment schedule."));
  return (data ?? {}) as RpcJson;
}

export async function fetchScheduleItems(bookingId: string): Promise<PaymentScheduleItem[]> {
  const { data, error } = await client()
    .from("payment_schedule_items")
    .select("*")
    .eq("booking_id", bookingId)
    .order("sequence");
  if (error) throw new Error(asError(error, "Could not load payment items."));
  return (data ?? []) as PaymentScheduleItem[];
}

export async function startTestCheckout(bookingId: string, scheduleItemId: string): Promise<RpcJson> {
  const { data, error } = await client().functions.invoke("create-payment-intent", {
    body: {
      booking_id: bookingId,
      schedule_item_id: scheduleItemId,
      success_url: appAbsoluteUrl(`app/customer/bookings/${bookingId}/return?session=success`),
      cancel_url: appAbsoluteUrl(`app/customer/bookings/${bookingId}/return?session=cancel`),
    },
  });
  if (error) throw new Error(error.message || "Could not start Stripe test checkout.");
  return (data ?? {}) as RpcJson;
}

export async function startConnectOnboarding(): Promise<RpcJson> {
  const { data, error } = await client().functions.invoke("create-connect-account-link", {
    body: {
      refresh_url: appAbsoluteUrl("app/pro/payouts"),
      return_url: appAbsoluteUrl("app/pro/payouts?onboarding=return"),
    },
  });
  if (error) throw new Error(error.message || "Could not start payout setup.");
  return (data ?? {}) as RpcJson;
}

export async function fetchMyConnectAccount(contractorProfileId: string): Promise<ContractorStripeAccount | null> {
  const { data, error } = await client()
    .from("contractor_stripe_accounts")
    .select("*")
    .eq("contractor_profile_id", contractorProfileId)
    .maybeSingle();
  if (error) throw new Error(asError(error, "Could not load payout status."));
  return data as ContractorStripeAccount | null;
}

export async function fetchMyTransfers(contractorProfileId: string) {
  const { data, error } = await client()
    .from("contractor_transfers")
    .select("*")
    .eq("contractor_profile_id", contractorProfileId)
    .order("created_at", { ascending: false });
  if (error) throw new Error(asError(error, "Could not load transfers."));
  return data ?? [];
}

export async function markMilestoneComplete(scheduleItemId: string): Promise<RpcJson> {
  const { data, error } = await client().rpc("mark_milestone_complete", { p_schedule_item_id: scheduleItemId });
  if (error) throw new Error(asError(error, "Could not mark the milestone complete."));
  return (data ?? {}) as RpcJson;
}

export async function approveMilestone(scheduleItemId: string): Promise<RpcJson> {
  const { data, error } = await client().rpc("approve_milestone", { p_schedule_item_id: scheduleItemId });
  if (error) throw new Error(asError(error, "Could not approve the milestone."));
  return (data ?? {}) as RpcJson;
}

export async function requestBookingCancellation(bookingId: string, reason?: string): Promise<RpcJson> {
  const { data, error } = await client().rpc("request_booking_cancellation", {
    p_booking_id: bookingId,
    p_reason: reason ?? null,
  });
  if (error) throw new Error(asError(error, "Could not request cancellation."));
  return (data ?? {}) as RpcJson;
}

export async function adminCreateRefund(paymentId: string, amountCents: number, reason: string): Promise<RpcJson> {
  const { data, error } = await client().functions.invoke("create-refund", {
    body: { payment_id: paymentId, amount_cents: amountCents, reason },
  });
  if (error) throw new Error(error.message || "Refund failed.");
  return (data ?? {}) as RpcJson;
}

export async function adminCreateTransfer(transferId: string): Promise<RpcJson> {
  const { data, error } = await client().functions.invoke("create-transfer", {
    body: { transfer_id: transferId },
  });
  if (error) throw new Error(error.message || "Transfer failed.");
  return (data ?? {}) as RpcJson;
}

export async function fetchBookingPayments(bookingId: string) {
  const { data, error } = await client()
    .from("payments")
    .select("id, amount_cents, status, stripe_payment_intent_id, created_at")
    .eq("booking_id", bookingId)
    .order("created_at");
  if (error) throw new Error(asError(error, "Could not load payments."));
  return data ?? [];
}

export async function fetchBookingTransfers(bookingId: string) {
  const { data, error } = await client()
    .from("contractor_transfers")
    .select("id, amount_cents, status, stripe_transfer_id, held_reason, created_at")
    .eq("booking_id", bookingId)
    .order("created_at");
  if (error) throw new Error(asError(error, "Could not load transfers."));
  return data ?? [];
}
