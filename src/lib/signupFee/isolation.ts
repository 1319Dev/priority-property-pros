import { CHARGES_LIVE, PAYMENTS_LIVE, SIGNUP_FEE_CENTS, STRIPE_TEST_MODE } from "./constants";

export type IsolationSnapshot = {
  signup_fee_cents: number;
  stripe_test_mode: number;
  payments_live: number;
  charges_live: number;
  job_payments_enabled: boolean;
  connect_payouts_enabled: boolean;
  uses_stripe_connect: boolean;
};

export const SIGNUP_FEE_ISOLATION: IsolationSnapshot = {
  signup_fee_cents: SIGNUP_FEE_CENTS,
  stripe_test_mode: STRIPE_TEST_MODE,
  payments_live: PAYMENTS_LIVE,
  charges_live: CHARGES_LIVE,
  job_payments_enabled: false,
  connect_payouts_enabled: false,
  uses_stripe_connect: false,
};

export function assertSignupFeeIsolation(snapshot: IsolationSnapshot): IsolationSnapshot {
  if (snapshot.signup_fee_cents !== SIGNUP_FEE_CENTS) {
    throw new Error("Signup fee isolation requires 999 cents.");
  }
  if (snapshot.stripe_test_mode !== 1) {
    throw new Error("Signup fee collection requires stripe_test_mode = 1.");
  }
  if (snapshot.payments_live !== 0) {
    throw new Error("Job payments_live must stay 0. Signup fee must not enable job payments.");
  }
  if (snapshot.charges_live !== 0) {
    throw new Error("Job charges_live must stay 0. Signup fee must not enable job charges.");
  }
  if (snapshot.job_payments_enabled || snapshot.connect_payouts_enabled || snapshot.uses_stripe_connect) {
    throw new Error("Signup fee path cannot enable job payments or Connect payouts.");
  }
  return snapshot;
}

export function isStripeTestSecret(secretKey: string): boolean {
  const value = secretKey.trim();
  return value.startsWith("sk_test_") && value.length > 16 && !value.startsWith("sk_live_");
}

export function assertStripeSecretIsTestMode(secretKey: string): void {
  if (!isStripeTestSecret(secretKey)) {
    throw new Error("Signup fee accepts only Stripe TEST secrets (sk_test_). Live keys are forbidden.");
  }
}

export function signupFeeCheckoutUsesConnect(params: {
  stripeAccount?: string | null;
  transferData?: unknown;
  applicationFeeAmount?: number | null;
}): boolean {
  if (params.stripeAccount) return true;
  if (params.transferData) return true;
  if (params.applicationFeeAmount) return true;
  return false;
}

export function buildSignupFeeStripeMetadata(profileId: string) {
  return {
    ppp_kind: "signup_fee",
    profile_id: profileId,
    amount_cents: String(SIGNUP_FEE_CENTS),
    payments_live: "0",
    charges_live: "0",
    stripe_test_mode: "1",
    connect: "0",
  };
}

export function isSignupFeeStripeEvent(metadata: Record<string, string> | null | undefined): boolean {
  return metadata?.ppp_kind === "signup_fee";
}
