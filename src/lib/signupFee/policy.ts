import type { AccountStatus, AccountType, ApprovalStatus } from "../auth/types";
import {
  FORBIDDEN_LEGACY_SIGNUP_FEE_CENTS,
  SIGNUP_FEE_CENTS,
  type SignupFeeStatus,
} from "./constants";

export function signupFeeRequiredForAccountType(accountType: AccountType | null | undefined): boolean {
  return accountType === "CUSTOMER" || accountType === "CONTRACTOR";
}

export function isSignupFeePaid(status: SignupFeeStatus | null | undefined): boolean {
  return status === "PAID" || status === "NOT_REQUIRED";
}

/** Paywall only when the kill switch is on. Flag off keeps current app behavior. */
export function needsSignupFeePayment(input: {
  enabled?: boolean | null;
  accountType?: AccountType | null;
  status?: SignupFeeStatus | null;
}): boolean {
  if (input.enabled !== true) return false;
  if (!signupFeeRequiredForAccountType(input.accountType)) return false;
  return !isSignupFeePaid(input.status);
}

export function assertSignupFeeAmount(amountCents: number): number {
  if (amountCents === FORBIDDEN_LEGACY_SIGNUP_FEE_CENTS) {
    throw new Error("Rejected legacy $9 signup fee. Amount must be 999 cents.");
  }
  if (amountCents !== SIGNUP_FEE_CENTS) {
    throw new Error(`Signup fee must be ${SIGNUP_FEE_CENTS} cents.`);
  }
  return amountCents;
}

export function canCreateSignupFeeCharge(status: SignupFeeStatus | null | undefined): boolean {
  return status !== "PAID" && status !== "NOT_REQUIRED";
}

export function approvalAfterSignupPayment(current: ApprovalStatus): ApprovalStatus {
  return current;
}

export function accountStatusAfterSignupPayment(current: AccountStatus): AccountStatus {
  return current;
}

export function payingSignupFeeApprovesContractor(): boolean {
  return false;
}

export function payingSignupFeeGrantsProjectContact(): boolean {
  return false;
}

export function payingSignupFeeActivatesJobPayments(): boolean {
  return false;
}

export function successUrlMarksSignupFeePaid(): boolean {
  return false;
}

export function canceledCheckoutLeavesUnpaid(): boolean {
  return true;
}

export function canClientMarkSignupFeePaid(): boolean {
  return false;
}
