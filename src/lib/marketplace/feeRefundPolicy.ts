/**
 * Signup/activation ($9.99) and Connection Fee ($4.99) refunds are product-blocked.
 * Stripe Dashboard refunds can still be issued by an operator outside this app.
 * Do not add Stripe refunds.create calls for these fees. Do not flip payment flags here.
 */

import { PLATFORM_FEES_NON_REFUNDABLE } from "../../data/pricing";

export const NON_REFUNDABLE_PLATFORM_FEES = ["signup_activation", "connection_fee"] as const;

export type NonRefundablePlatformFee = (typeof NON_REFUNDABLE_PLATFORM_FEES)[number];

export const PLATFORM_FEE_REFUND_BLOCKED = true;

export const PLATFORM_FEE_REFUND_BLOCKED_REASON = `${PLATFORM_FEES_NON_REFUNDABLE} This app does not issue refunds for those fees.`;

/** Always false. There is no in-app refund for these fees. */
export function canRefundPlatformFee(kind: NonRefundablePlatformFee): false {
  void kind;
  return false;
}

/**
 * Dead path. Never issues a Stripe or database refund.
 * Callers must not catch-and-ignore this to pretend a refund succeeded.
 */
export function refundPlatformFee(kind: NonRefundablePlatformFee): never {
  throw new Error(`${PLATFORM_FEE_REFUND_BLOCKED_REASON} (${kind})`);
}
