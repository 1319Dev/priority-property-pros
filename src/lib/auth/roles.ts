import type { AccountStatus, AccountType, PublicSignupType } from "./types";
import type { SignupFeeStatus } from "../signupFee/constants";
import { PUBLIC_SIGNUP_TYPES } from "./types";
import { needsSignupFeePayment } from "../signupFee/policy";
import { SIGNUP_FEE_ACTIVATE_PATH } from "../signupFee/constants";
import { safeReturnPath as safeLocalReturnPath } from "./sessionReturn";

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

/** True when a path segment or query value is asking to open a verifier signup. */
export function requestsVerifierSignup(values: readonly unknown[]): boolean {
  return values.some((value) => typeof value === "string" && value.trim().toUpperCase() === "VERIFIER");
}

/** Client metadata may request customer or contractor only. ADMIN and VERIFIER are never accepted. */
export function sanitizeSignupAccountType(value: unknown): PublicSignupType {
  if (typeof value === "string") {
    const normalized = value.trim().toUpperCase();
    if (normalized !== "VERIFIER" && isPublicSignupType(normalized)) return normalized;
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

const ROLE_APP_PREFIXES = Object.entries(ROLE_HOME) as Array<[AccountType, string]>;

/** Pages that exist under each role's own /app/<role> prefix (see App.tsx). */
const ROLE_SHARED_PAGES: Record<AccountType, readonly string[]> = {
  CUSTOMER: ["/account", "/account/notifications", "/notifications", "/messages"],
  CONTRACTOR: ["/account", "/account/notifications", "/notifications", "/messages"],
  VERIFIER: ["/account", "/account/notifications", "/messages"],
  ADMIN: ["/account", "/account/notifications"],
};

/**
 * A path saved before sign-in (or a link) can belong to another role, for example
 * /app/customer/account from an earlier customer session. Send the signed-in role to
 * the same page under its own prefix when that page exists for every role, otherwise
 * to its dashboard. Paths outside /app/ are returned unchanged.
 */
export function pathForRole(path: string, accountType: AccountType): string {
  const own = ROLE_HOME[accountType];
  if (path === own || path.startsWith(`${own}/`) || path.startsWith(`${own}?`)) return path;
  for (const [role, prefix] of ROLE_APP_PREFIXES) {
    if (role === accountType) continue;
    if (path === prefix || path.startsWith(`${prefix}/`) || path.startsWith(`${prefix}?`)) {
      const rest = path.slice(prefix.length).split(/[?#]/)[0];
      return ROLE_SHARED_PAGES[accountType].includes(rest) ? `${own}${rest}` : own;
    }
  }
  return path;
}

/**
 * Where to go after sign-in. A saved "from" path is honored only when it passes
 * sessionReturn.safeReturnPath (#96: local, not protocol-relative, not /sign-in);
 * another role's /app path is mapped with pathForRole. Activation and blocked-status
 * pages still win.
 */
export function roleReturnPath(from: string | null | undefined, accountType: AccountType, fallback: string): string {
  const local = safeLocalReturnPath(from);
  if (!local) return fallback;
  if (fallback === "/account/activate" || fallback === "/account/status") return fallback;
  return pathForRole(local, accountType);
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
