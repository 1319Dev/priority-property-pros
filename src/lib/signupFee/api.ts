import { getSupabaseClient } from "../supabase/client";
import { customerFacingConnectionCheckoutError } from "../marketplace/connectionCheckout";
import { SIGNUP_FEE_CHECKOUT_FUNCTION, SIGNUP_FEE_RECONCILE_FUNCTION } from "./constants";

export async function fetchSignupFeeCheckoutFlags(): Promise<{
  enabled: boolean;
  fee_cents: number;
  stripe_test_mode: boolean;
}> {
  const supabase = getSupabaseClient();
  if (!supabase) return { enabled: false, fee_cents: 999, stripe_test_mode: true };
  const { data, error } = await supabase.rpc("signup_fee_checkout_flags");
  if (error) return { enabled: false, fee_cents: 999, stripe_test_mode: true };
  const row = (data ?? {}) as Record<string, unknown>;
  return {
    enabled: row.enabled === true,
    fee_cents: Number(row.fee_cents ?? 999),
    stripe_test_mode: row.stripe_test_mode !== false,
  };
}

export async function startSignupFeeCheckout(origin?: string): Promise<{
  checkout_url: string | null;
  already_paid: boolean;
}> {
  const supabase = getSupabaseClient();
  if (!supabase) throw new Error("Supabase is not configured yet.");
  const { data, error } = await supabase.functions.invoke(SIGNUP_FEE_CHECKOUT_FUNCTION, {
    body: {
      origin: origin ?? (typeof window !== "undefined" ? window.location.origin : ""),
    },
  });
  if (error) {
    throw new Error(await customerFacingConnectionCheckoutError(data, error, "Could not start the $9.99 activation payment."));
  }
  const payload = data as { checkout_url?: string; error?: string; already_paid?: boolean; checkout_disabled?: boolean };
  if (payload?.already_paid) return { checkout_url: null, already_paid: true };
  if (payload?.checkout_disabled) {
    throw new Error("Account activation checkout is not enabled.");
  }
  if (!payload?.checkout_url) {
    throw new Error(payload?.error || "Could not start the $9.99 activation payment.");
  }
  return { checkout_url: payload.checkout_url, already_paid: false };
}

export async function reconcileSignupFeeCheckout(sessionId: string): Promise<{ paid: boolean }> {
  const supabase = getSupabaseClient();
  if (!supabase) throw new Error("Supabase is not configured yet.");
  const { data, error } = await supabase.functions.invoke(SIGNUP_FEE_RECONCILE_FUNCTION, {
    body: { session_id: sessionId },
  });
  if (error) {
    throw new Error(
      await customerFacingConnectionCheckoutError(data, error, "Could not confirm the $9.99 activation payment."),
    );
  }
  const payload = data as { paid?: boolean };
  return { paid: Boolean(payload?.paid) };
}
