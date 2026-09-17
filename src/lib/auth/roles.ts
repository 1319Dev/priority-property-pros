import type { AccountStatus, AccountType, PublicSignupType, SignupFeeStatus } from "./types";
import { PUBLIC_SIGNUP_TYPES } from "./types";
import { needsSignupFeePayment } from "../signupFee/policy";
import { SIGNUP_FEE_ACTIVATE_PATH } from "../signupFee/api";

export const ROLE_HOME: Record<AccountType, string> = {
  CUSTOMER: "/app/customer",
  CONTRACTOR: "/app/pro",
  VERIFIER: "/app/verifier",
  ADMIN: "/app/admin",
};

export const BLOCKED_STATUSES: AccountStatus[] = ["SUSPENDED", "DISABLED", "DELETED"];

export function isPublicSignupType(value: string): value is PublicSignupType {
  return (PUBLIC_SIGNUP_TYPES as readonly string[]).includes(value);
}

/** Client metadata may request these types only. ADMIN is never accepted. */
export function sanitizeSignupAccountType(value: unknown): PublicSignupType {
  if (typeof value === "string" && isPublicSignupType(value.toUpperCase())) {
    return value.toUpperCase() as PublicSignupType;
  }
  return "CUSTOMER";
}

export function postLoginPath(
  accountType: AccountType | null,
  accountStatus: AccountStatus | null,
  signupFeeStatus: SignupFeeStatus | null = null,
): string {
  if (!accountType) return "/sign-in";
  if (accountStatus && BLOCKED_STATUSES.includes(accountStatus)) return "/account/status";
  if (needsSignupFeePayment(accountType, signupFeeStatus)) return SIGNUP_FEE_ACTIVATE_PATH;
  return ROLE_HOME[accountType];
}

export function displayName(first: string, last: string, email: string): string {
  const full = `${first} ${last}`.trim();
  return full || email;
}
