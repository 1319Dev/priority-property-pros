import type { AccountStatus, AccountType, PublicSignupType } from "./types";
import { PUBLIC_SIGNUP_TYPES } from "./types";

export const ROLE_HOME: Record<AccountType, string> = {
  CUSTOMER: "/app/customer",
  CONTRACTOR: "/app/pro",
  VERIFIER: "/app/verifier",
  ADMIN: "/app/admin",
};

export const BLOCKED_STATUSES: AccountStatus[] = ["DISABLED", "DELETED", "DELETED_ANONYMIZED"];

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

export function postLoginPath(accountType: AccountType | null, accountStatus: AccountStatus | null): string {
  if (!accountType) return "/sign-in";
  if (accountStatus && BLOCKED_STATUSES.includes(accountStatus)) return "/account/status";
  return ROLE_HOME[accountType];
}

export function displayName(first: string, last: string, email: string): string {
  const full = `${first} ${last}`.trim();
  return full || email;
}
