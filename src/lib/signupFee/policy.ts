import type { AccountStatus, AccountType, ApprovalStatus } from "../auth/types";
import {
  FORBIDDEN_LEGACY_SIGNUP_FEE_CENTS,
  SIGNUP_FEE_CENTS,
  type SignupFeeStatus,
} from "./constants";
import { CONTRACTOR_PLANS, type ContractorPlanId } from "./plans";

export function signupFeeRequiredForAccountType(accountType: AccountType | null): boolean {
  return accountType === "CUSTOMER" || accountType === "CONTRACTOR";
}

export function isSignupFeePaid(status: SignupFeeStatus | null | undefined): boolean {
  return status === "PAID" || status === "NOT_REQUIRED";
}

export function needsSignupFeePayment(
  accountType: AccountType | null | undefined,
  signupFeeStatus: SignupFeeStatus | null | undefined,
): boolean {
  if (!signupFeeRequiredForAccountType(accountType ?? null)) return false;
  return !isSignupFeePaid(signupFeeStatus);
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

/** Paying the signup fee never changes contractor approval. */
export function approvalAfterSignupPayment(current: ApprovalStatus): ApprovalStatus {
  return current;
}

/** Paying the signup fee never changes account_status. */
export function accountStatusAfterSignupPayment(current: AccountStatus): AccountStatus {
  return current;
}

export function payingSignupFeeApprovesContractor(): boolean {
  return false;
}

export function payingSignupFeeActivatesJobPayments(): boolean {
  return false;
}

export function payingSignupFeeEnablesConnectPayouts(): boolean {
  return false;
}

export function membershipAfterSignupPayment(plan: ContractorPlanId | null | undefined): ContractorPlanId {
  return plan ?? CONTRACTOR_PLANS.FREE.id;
}

export function defaultContractorPlan(): ContractorPlanId {
  return CONTRACTOR_PLANS.FREE.id;
}
