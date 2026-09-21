import type { AccountStatus, AccountType, PublicSignupType } from "./types";
import type { SignupFeeStatus } from "../signupFee/constants";
import { PUBLIC_SIGNUP_TYPES } from "./types";
import { needsSignupFeePayment } from "../signupFee/policy";
import { SIGNUP_FEE_ACTIVATE_PATH } from "../signupFee/constants";

export const ROLE_HOME: Record<AccountType, string> = {
  CUSTOMER: "/app/customer",
  CONTRACTOR: "/app/pro",
  VERIFIER: "/app/verifier",
  ADMIN: "/app/admin",
};

export const ROLE_ACCOUNT: Record<AccountType, string> = {
  CUSTOMER: "/app/customer/account",
  CONTRACTOR: "/app/pro/account",
  VERIFIER: "/app/verifier/account",
  ADMIN: "/app/admin/account",
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
  signup?: { enabled?: boolean | null; status?: SignupFeeStatus | null } | null,
): string {
  if (!accountType) return "/sign-in";
  if (accountStatus && BLOCKED_STATUSES.includes(accountStatus)) return "/account/status";
  if (needsSignupFeePayment({ enabled: signup?.enabled, accountType, status: signup?.status })) {
    return SIGNUP_FEE_ACTIVATE_PATH;
  }
  return ROLE_HOME[accountType];
}

export function accountSettingsPath(
  accountType: AccountType | null,
  accountStatus: AccountStatus | null,
): string {
  if (!accountType) return "/sign-in";
  if (accountStatus && BLOCKED_STATUSES.includes(accountStatus)) return "/account/status";
  return ROLE_ACCOUNT[accountType];
}

export function accountInitials(firstName?: string | null, lastName?: string | null, email?: string | null): string {
  const first = firstName?.trim().charAt(0);
  const last = lastName?.trim().charAt(0);
  if (first && last) return `${first}${last}`.toUpperCase();
  if (first) return first.toUpperCase();
  const fromEmail = email?.trim().charAt(0);
  return fromEmail ? fromEmail.toUpperCase() : "?";
}

export function displayName(first: string, last: string, email: string): string {
  const full = `${first} ${last}`.trim();
  return full || email;
}
