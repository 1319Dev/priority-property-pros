import type { Factor } from "@supabase/supabase-js";
import { getSupabaseClient } from "../supabase/client";
import {
  MFA_ENTER_CODE,
  MFA_GENERIC,
  MFA_ISSUER,
  canUnenrollVerifiedFactor,
  decideAdminMfaGate,
  digitsOnly,
  friendlyMfaError,
  normalizeAssuranceLevel,
  totpQrSrc,
  type AdminMfaDecision,
  type AssuranceLevel,
  type MfaErrorLike,
} from "./adminMfa";

export type AdminTotpFactor = {
  id: string;
  friendlyName: string;
  status: "verified" | "unverified";
  createdAt: string;
};

export type AdminMfaGateState =
  | { status: "allow" }
  | { status: "challenge"; factors: AdminTotpFactor[] }
  | { status: "blocked" };

export type AdminMfaSnapshot = {
  mfaRequired: boolean;
  currentLevel: AssuranceLevel | null;
  factors: AdminTotpFactor[];
  error: string | null;
};

type MfaResult<T> = { data: T | null; error: MfaErrorLike | null };

function mfaClient() {
  const supabase = getSupabaseClient();
  if (!supabase) return null;
  return supabase;
}

function mapTotp(factor: Factor): AdminTotpFactor | null {
  if (factor.factor_type !== "totp") return null;
  if (factor.status !== "verified" && factor.status !== "unverified") return null;
  return {
    id: factor.id,
    friendlyName: factor.friendly_name?.trim() || "Authenticator",
    status: factor.status,
    createdAt: factor.created_at,
  };
}

export async function readAdminMfaRequired(): Promise<boolean> {
  const supabase = mfaClient();
  if (!supabase) return false;
  const { data, error } = await supabase.rpc("admin_mfa_required");
  if (error) return false;
  return data === true;
}

async function readAssurance(): Promise<{ known: boolean; currentLevel: AssuranceLevel | null; nextLevel: AssuranceLevel | null }> {
  const supabase = mfaClient();
  if (!supabase) return { known: false, currentLevel: null, nextLevel: null };
  const { data, error } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
  if (error || !data) return { known: false, currentLevel: null, nextLevel: null };
  return {
    known: true,
    currentLevel: normalizeAssuranceLevel(data.currentLevel),
    nextLevel: normalizeAssuranceLevel(data.nextLevel),
  };
}

export async function listAdminTotpFactors(): Promise<{ factors: AdminTotpFactor[]; error: string | null }> {
  const supabase = mfaClient();
  if (!supabase) return { factors: [], error: "Supabase is not configured yet." };
  const { data, error } = await supabase.auth.mfa.listFactors();
  if (error || !data) return { factors: [], error: friendlyMfaError(error) };
  const factors = data.all.map(mapTotp).filter((factor): factor is AdminTotpFactor => factor !== null);
  return { factors, error: null };
}

export async function loadAdminMfaGate(): Promise<AdminMfaGateState> {
  const supabase = mfaClient();
  if (!supabase) return { status: "allow" };

  const [mfaRequired, assurance, listed] = await Promise.all([
    readAdminMfaRequired(),
    readAssurance(),
    supabase.auth.mfa.listFactors(),
  ]);

  const decision: AdminMfaDecision = decideAdminMfaGate({
    mfaRequired,
    assuranceKnown: assurance.known,
    currentLevel: assurance.currentLevel,
    nextLevel: assurance.nextLevel,
  });

  if (decision === "challenge") {
    const factors = (listed.data?.totp ?? [])
      .map(mapTotp)
      .filter((factor): factor is AdminTotpFactor => factor !== null && factor.status === "verified");
    return { status: "challenge", factors };
  }
  if (decision === "blocked") return { status: "blocked" };
  return { status: "allow" };
}

export async function loadAdminMfaSnapshot(): Promise<AdminMfaSnapshot> {
  const [mfaRequired, assurance, listed] = await Promise.all([
    readAdminMfaRequired(),
    readAssurance(),
    listAdminTotpFactors(),
  ]);
  return {
    mfaRequired,
    currentLevel: assurance.currentLevel,
    factors: listed.factors,
    error: listed.error,
  };
}

export async function enrollAdminTotp(
  friendlyName: string,
): Promise<{ error: string } | { factorId: string; qrSrc: string; secret: string }> {
  const name = friendlyName.trim();
  if (!name) return { error: "Name this device so you can tell it apart from a backup." };
  if (name.length > 64) return { error: "Use a device name of 64 characters or fewer." };
  const supabase = mfaClient();
  if (!supabase) return { error: "Supabase is not configured yet." };
  const { data, error } = await supabase.auth.mfa.enroll({
    factorType: "totp",
    friendlyName: name,
    issuer: MFA_ISSUER,
  });
  if (error || !data?.totp?.qr_code || !data.totp.secret) {
    return { error: error ? friendlyMfaError(error) : MFA_GENERIC };
  }
  return {
    factorId: data.id,
    qrSrc: totpQrSrc(data.totp.qr_code),
    secret: data.totp.secret,
  };
}

export async function challengeAndVerifyTotp(factorId: string, code: string): Promise<{ error: string | null }> {
  const normalized = digitsOnly(code);
  if (normalized.length !== 6) return { error: MFA_ENTER_CODE };
  const supabase = mfaClient();
  if (!supabase) return { error: "Supabase is not configured yet." };

  const challenge: MfaResult<{ id: string }> = await supabase.auth.mfa.challenge({ factorId });
  if (challenge.error || !challenge.data?.id) {
    return { error: friendlyMfaError(challenge.error) };
  }
  const verified = await supabase.auth.mfa.verify({
    factorId,
    challengeId: challenge.data.id,
    code: normalized,
  });
  if (verified.error) return { error: friendlyMfaError(verified.error) };
  return { error: null };
}

/** Sign-in step after password or password-reset. Same challenge and verify as enrollment. */
export const verifyAdminSignInCode = challengeAndVerifyTotp;

/** Drop an enrollment that was never verified. Does not apply the last-factor rule. */
export async function discardAdminFactor(factorId: string): Promise<{ error: string | null }> {
  const supabase = mfaClient();
  if (!supabase) return { error: "Supabase is not configured yet." };
  const { error } = await supabase.auth.mfa.unenroll({ factorId });
  if (error) return { error: friendlyMfaError(error) };
  return { error: null };
}

export async function removeAdminFactor(factorId: string): Promise<{ error: string | null }> {
  const supabase = mfaClient();
  if (!supabase) return { error: "Supabase is not configured yet." };

  const [mfaRequired, assurance, listed] = await Promise.all([
    readAdminMfaRequired(),
    readAssurance(),
    listAdminTotpFactors(),
  ]);
  if (listed.error) return { error: listed.error };
  const target = listed.factors.find((factor) => factor.id === factorId);
  if (!target) return { error: "That authenticator is no longer on this account. Refresh and try again." };

  if (target.status === "verified") {
    const decision = canUnenrollVerifiedFactor({
      currentLevel: assurance.known ? assurance.currentLevel : null,
      verifiedCount: listed.factors.filter((factor) => factor.status === "verified").length,
      mfaRequired,
    });
    if (!decision.allowed) return { error: decision.reason };
  }

  const { error } = await supabase.auth.mfa.unenroll({ factorId });
  if (error) return { error: friendlyMfaError(error) };
  return { error: null };
}
