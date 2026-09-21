/** Isolated $9.99 account activation / signup fee. Never a Connection Fee or job-payment amount. */

export const SIGNUP_FEE_CENTS = 999;
export const SIGNUP_FEE_USD = "$9.99";
export const SIGNUP_FEE_CURRENCY = "usd";
export const SIGNUP_PRICE_TYPE = "one_time";

export const SIGNUP_FEE_STATUSES = ["UNPAID", "PAID", "NOT_REQUIRED"] as const;
export type SignupFeeStatus = (typeof SIGNUP_FEE_STATUSES)[number];

export const SIGNUP_FEE_KIND = "signup_fee";

/** Hard product amount. Reject any older $9 (900 cents) amount. */
export const FORBIDDEN_LEGACY_SIGNUP_FEE_CENTS = 900;

export const SIGNUP_FEE_CHECKOUT_FUNCTION = "create-signup-fee-checkout";
export const SIGNUP_FEE_RECONCILE_FUNCTION = "reconcile-signup-fee-checkout";
export const SIGNUP_FEE_WEBHOOK_FUNCTION = "signup-fee-webhook";

export const SIGNUP_FEE_SECRET_NAMES = [
  "STRIPE_SECRET_KEY",
  "STRIPE_ACTIVATION_PRICE_ID",
  "STRIPE_SIGNUP_FEE_WEBHOOK_SECRET",
] as const;

export const SIGNUP_FEE_ACTIVATE_PATH = "/account/activate";
