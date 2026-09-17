/** Isolated $9.99 account signup/activation fee. Never a job-payment amount. */

export const SIGNUP_FEE_CENTS = 999;
export const SIGNUP_FEE_USD = "$9.99";
export const SIGNUP_FEE_CURRENCY = "usd";

export const SIGNUP_FEE_STATUSES = ["UNPAID", "PAID", "NOT_REQUIRED"] as const;
export type SignupFeeStatus = (typeof SIGNUP_FEE_STATUSES)[number];

export const SIGNUP_FEE_KINDS = ["signup_fee"] as const;
export type SignupFeeKind = (typeof SIGNUP_FEE_KINDS)[number];

/** Hard product amount. Reject any older $9 (900 cents) amount. */
export const FORBIDDEN_LEGACY_SIGNUP_FEE_CENTS = 900;

export const STRIPE_TEST_MODE = 1;
export const PAYMENTS_LIVE = 0;
export const CHARGES_LIVE = 0;

export const SIGNUP_FEE_CHECKOUT_FUNCTION = "create-signup-fee-checkout";
export const SIGNUP_FEE_WEBHOOK_FUNCTION = "signup-fee-webhook";

export const SIGNUP_FEE_METADATA_KIND = "signup_fee";

export const SIGNUP_FEE_SECRET_NAMES = ["STRIPE_SECRET_KEY", "STRIPE_SIGNUP_FEE_WEBHOOK_SECRET"] as const;
