import type { AccountStatus, ApprovalStatus } from "../auth/types";
import { SIGNUP_FEE_CENTS, type SignupFeeStatus } from "./constants";
import { SIGNUP_FEE_ISOLATION } from "./isolation";
import { accountStatusAfterSignupPayment, approvalAfterSignupPayment, canCreateSignupFeeCharge } from "./policy";

export type SignupFeeLedgerRow = {
  profile_id: string;
  status: SignupFeeStatus;
  amount_cents: number;
};

export type ApplySignupFeePaidInput = {
  profile_id: string;
  amount_cents: number;
  current_signup_fee_status: SignupFeeStatus;
  current_account_status: AccountStatus;
  current_approval_status: ApprovalStatus | null;
  already_processed_event: boolean;
};

export type ApplySignupFeePaidResult = {
  ok: true;
  duplicate: boolean;
  already_paid: boolean;
  signup_fee_status: SignupFeeStatus;
  account_status: AccountStatus;
  approval_status: ApprovalStatus | null;
  payments_live: false;
  charges_live: false;
  connect_payouts_enabled: false;
  job_payments_enabled: false;
};

export function applySignupFeePaid(input: ApplySignupFeePaidInput): ApplySignupFeePaidResult {
  if (input.amount_cents !== SIGNUP_FEE_CENTS) {
    throw new Error("Signup fee amount must be 999 cents.");
  }

  const base = {
    payments_live: false as const,
    charges_live: false as const,
    connect_payouts_enabled: false as const,
    job_payments_enabled: false as const,
    account_status: accountStatusAfterSignupPayment(input.current_account_status),
    approval_status: input.current_approval_status
      ? approvalAfterSignupPayment(input.current_approval_status)
      : null,
  };

  if (input.already_processed_event) {
    return {
      ok: true,
      duplicate: true,
      already_paid: input.current_signup_fee_status === "PAID",
      signup_fee_status: input.current_signup_fee_status,
      ...base,
    };
  }

  if (!canCreateSignupFeeCharge(input.current_signup_fee_status) && input.current_signup_fee_status === "PAID") {
    return {
      ok: true,
      duplicate: false,
      already_paid: true,
      signup_fee_status: "PAID",
      ...base,
    };
  }

  return {
    ok: true,
    duplicate: false,
    already_paid: false,
    signup_fee_status: "PAID",
    ...base,
  };
}

export function isolationUnchangedAfterSignupPayment() {
  return { ...SIGNUP_FEE_ISOLATION };
}
