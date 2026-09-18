import {
  CHARGES_LIVE,
  CONNECTION_FEE_CENTS,
  CONNECTION_FEE_USD,
  PAYMENTS_LIVE,
  SIGNUP_FEE_ENABLED,
  STRIPE_ENABLED,
  STRIPE_TEST_MODE,
} from "./types";

/** Server-authoritative Connection Fee. Clients must never send a different amount. */
export const AUTHORITATIVE_CONNECTION_FEE_CENTS = CONNECTION_FEE_CENTS;

export type ConnectionFeePreview = {
  fee_cents: number;
  fee_usd: string;
  payments_live: false;
  charges_live: false;
  signup_fee_enabled: false;
  stripe_enabled: false;
  stripe_test_mode: true;
  label: "Connection Fee — payments not live";
};

export function connectionFeeCents(): number {
  return AUTHORITATIVE_CONNECTION_FEE_CENTS;
}

export function connectionFeeUsd(): string {
  return CONNECTION_FEE_USD;
}

/** Ignores any client-supplied amount. Price is never client-set. */
export function serverConnectionFee(clientAttemptedCents?: number | null): ConnectionFeePreview {
  void clientAttemptedCents;
  return {
    fee_cents: AUTHORITATIVE_CONNECTION_FEE_CENTS,
    fee_usd: CONNECTION_FEE_USD,
    payments_live: false,
    charges_live: false,
    signup_fee_enabled: false,
    stripe_enabled: false,
    stripe_test_mode: true,
    label: "Connection Fee — payments not live",
  };
}

export function clientCannotChangeConnectionPrice(attemptedCents: number | null | undefined): boolean {
  if (attemptedCents == null) return true;
  return attemptedCents === AUTHORITATIVE_CONNECTION_FEE_CENTS;
}

export function paymentFlagsRemainOff(): boolean {
  return (
    PAYMENTS_LIVE === false &&
    CHARGES_LIVE === false &&
    SIGNUP_FEE_ENABLED === false &&
    STRIPE_ENABLED === false &&
    STRIPE_TEST_MODE === true
  );
}
