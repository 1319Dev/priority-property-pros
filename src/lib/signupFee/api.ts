import { authRedirectUrl } from "../auth/redirects";
import { getSupabaseClient } from "../supabase/client";
import { SIGNUP_FEE_CHECKOUT_FUNCTION } from "./constants";

export const SIGNUP_FEE_ACTIVATE_PATH = "/account/activate";

export function signupFeeReturnUrl(state: "return" | "cancel"): string {
  return authRedirectUrl(`${SIGNUP_FEE_ACTIVATE_PATH}?state=${state}`);
}

export async function startSignupFeeCheckout(): Promise<{ checkout_url: string }> {
  const supabase = getSupabaseClient();
  if (!supabase) throw new Error("Supabase is not configured yet.");
  const { data, error } = await supabase.functions.invoke(SIGNUP_FEE_CHECKOUT_FUNCTION, {
    body: {
      success_url: `${signupFeeReturnUrl("return")}&session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: signupFeeReturnUrl("cancel"),
    },
  });
  if (error) throw new Error(error.message || "Could not start the $9.99 signup payment.");
  const payload = data as { checkout_url?: string; error?: string; already_paid?: boolean };
  if (payload?.already_paid) {
    return { checkout_url: SIGNUP_FEE_ACTIVATE_PATH };
  }
  if (!payload?.checkout_url) {
    throw new Error(payload?.error || "Could not start the $9.99 signup payment.");
  }
  return { checkout_url: payload.checkout_url };
}
