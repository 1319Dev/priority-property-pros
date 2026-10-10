/** Pure admin authenticator decisions. No Supabase client. */

export const MFA_ISSUER = "Priority Property Pros";

export const MFA_WRONG_CODE =
  "That code didn't match. Enter the current 6-digit code from your authenticator.";
export const MFA_EXPIRED_CODE =
  "That code expired. Enter the new code showing in your authenticator.";
export const MFA_RATE_LIMIT = "Too many attempts. Wait a minute, then try the current code.";
export const MFA_ENTER_CODE = "Enter the 6-digit code from your authenticator.";
export const MFA_GENERIC = "Couldn't verify that code. Try again.";

export type AssuranceLevel = "aal1" | "aal2";

export type AdminMfaDecision = "allow" | "challenge" | "blocked";

export type MfaErrorLike = {
  message?: string | null;
  status?: number | null;
  code?: string | null;
};

export function normalizeAssuranceLevel(level: string | null | undefined): AssuranceLevel | null {
  if (level === "aal1" || level === "aal2") return level;
  return null;
}

/**
 * UX gate for admin routes.
 * A verified factor (next aal2 while the session is still below aal2) always
 * challenges, even when the database flag is off.
 * The flag blocks admin pages only when this session cannot reach aal2.
 * An unknown assurance check fails open while the flag is off.
 */
export function decideAdminMfaGate(input: {
  mfaRequired: boolean;
  assuranceKnown: boolean;
  currentLevel: AssuranceLevel | null;
  nextLevel: AssuranceLevel | null;
}): AdminMfaDecision {
  if (!input.assuranceKnown) {
    return input.mfaRequired ? "blocked" : "allow";
  }
  if (input.currentLevel === "aal2") return "allow";
  if (input.nextLevel === "aal2") return "challenge";
  if (input.mfaRequired) return "blocked";
  return "allow";
}

export function friendlyMfaError(error: MfaErrorLike | null | undefined): string {
  const code = (error?.code ?? "").toLowerCase();
  const message = (error?.message ?? "").toLowerCase();
  const status = error?.status ?? 0;

  if (
    status === 429 ||
    code === "over_request_rate_limit" ||
    message.includes("rate limit") ||
    message.includes("too many requests")
  ) {
    return MFA_RATE_LIMIT;
  }
  if (code === "mfa_challenge_expired" || (message.includes("challenge") && message.includes("expir"))) {
    return MFA_EXPIRED_CODE;
  }
  if (code === "mfa_factor_name_conflict" || message.includes("friendly name")) {
    return "That device name is already in use. Choose another name.";
  }
  if (code === "insufficient_aal") {
    return "Enter an authenticator code before changing your devices.";
  }
  if (code === "mfa_totp_enroll_not_enabled" || code === "mfa_totp_verify_not_enabled") {
    return "Authenticator codes are turned off for this project. An owner can enable them under Authentication, then Multi-Factor.";
  }
  if (code === "mfa_factor_not_found") {
    return "That authenticator is no longer on this account. Refresh and try again.";
  }
  if (
    code === "mfa_verification_failed" ||
    code === "mfa_verification_rejected" ||
    message.includes("invalid totp") ||
    message.includes("invalid code") ||
    message.includes("verification failed")
  ) {
    return MFA_WRONG_CODE;
  }
  return MFA_GENERIC;
}

/** Verified factors can be removed only at aal2, and not the last one while enforcement is on. */
export function canUnenrollVerifiedFactor(input: {
  currentLevel: AssuranceLevel | null;
  verifiedCount: number;
  mfaRequired: boolean;
}): { allowed: boolean; reason: string | null } {
  if (input.currentLevel !== "aal2") {
    return {
      allowed: false,
      reason: "Enter an authenticator code before removing a device.",
    };
  }
  if (input.mfaRequired && input.verifiedCount <= 1) {
    return {
      allowed: false,
      reason:
        "This is the last authenticator, and admin sign-in requires one. Add a backup device before removing it.",
    };
  }
  return { allowed: true, reason: null };
}

/** Supabase returns an SVG. Encode it so the otpauth URI does not truncate the image URL. */
export function totpQrSrc(qr: string): string {
  const value = qr.trim();
  if (value.startsWith("data:")) return value;
  return `data:image/svg+xml;utf-8,${encodeURIComponent(value)}`;
}

export function digitsOnly(value: string): string {
  return value.replace(/\D/g, "");
}
