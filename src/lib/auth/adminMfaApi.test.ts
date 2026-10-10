import { beforeEach, describe, expect, it, vi } from "vitest";
import { MFA_EXPIRED_CODE, MFA_RATE_LIMIT, MFA_WRONG_CODE } from "./adminMfa";

const { state } = vi.hoisted(() => ({
  state: {
    client: true,
    rpc: vi.fn(),
    enroll: vi.fn(),
    challenge: vi.fn(),
    verify: vi.fn(),
    unenroll: vi.fn(),
    listFactors: vi.fn(),
    getAuthenticatorAssuranceLevel: vi.fn(),
  },
}));

vi.mock("../supabase/client", () => ({
  getSupabaseClient: () =>
    state.client
      ? {
          rpc: state.rpc,
          auth: {
            mfa: {
              enroll: state.enroll,
              challenge: state.challenge,
              verify: state.verify,
              unenroll: state.unenroll,
              listFactors: state.listFactors,
              getAuthenticatorAssuranceLevel: state.getAuthenticatorAssuranceLevel,
            },
          },
        }
      : null,
}));

import { loadAdminMfaGate, removeAdminFactor, verifyAdminSignInCode } from "./adminMfaApi";

const phone = {
  id: "phone-1",
  friendly_name: "Phone",
  factor_type: "totp" as const,
  status: "verified" as const,
  created_at: "2026-10-01T00:00:00Z",
  updated_at: "2026-10-01T00:00:00Z",
};

function assurance(currentLevel: "aal1" | "aal2" | null, nextLevel: "aal1" | "aal2" | null) {
  state.getAuthenticatorAssuranceLevel.mockResolvedValue({
    data: { currentLevel, nextLevel, currentAuthenticationMethods: [] },
    error: null,
  });
}

describe("admin MFA flag and sign-in step", () => {
  beforeEach(() => {
    state.client = true;
    state.rpc.mockReset();
    state.challenge.mockReset();
    state.verify.mockReset();
    state.unenroll.mockReset();
    state.listFactors.mockReset();
    state.getAuthenticatorAssuranceLevel.mockReset();
    state.listFactors.mockResolvedValue({ data: { all: [phone], totp: [phone], phone: [] }, error: null });
    state.rpc.mockResolvedValue({ data: false, error: null });
    assurance("aal1", "aal1");
  });

  it("allows admin pages when the flag is off and no factor is enrolled", async () => {
    await expect(loadAdminMfaGate()).resolves.toEqual({ status: "allow" });
  });

  it("treats a missing flag function as off", async () => {
    state.rpc.mockResolvedValue({
      data: null,
      error: { message: "Could not find the function public.admin_mfa_required" },
    });
    await expect(loadAdminMfaGate()).resolves.toEqual({ status: "allow" });
  });

  it("challenges when a verified factor exists and the flag is off", async () => {
    assurance("aal1", "aal2");
    await expect(loadAdminMfaGate()).resolves.toEqual({
      status: "challenge",
      factors: [
        {
          id: "phone-1",
          friendlyName: "Phone",
          status: "verified",
          createdAt: "2026-10-01T00:00:00Z",
        },
      ],
    });
  });

  it("allows an aal2 session when the flag is on", async () => {
    state.rpc.mockResolvedValue({ data: true, error: null });
    assurance("aal2", "aal2");
    await expect(loadAdminMfaGate()).resolves.toEqual({ status: "allow" });
  });

  it("blocks admin pages when the flag is on and nothing is enrolled", async () => {
    state.rpc.mockResolvedValue({ data: true, error: null });
    await expect(loadAdminMfaGate()).resolves.toEqual({ status: "blocked" });
  });

  it("maps wrong codes, expired challenges, and rate limits on the sign-in step", async () => {
    state.challenge.mockResolvedValueOnce({ data: { id: "ch-1" }, error: null });
    state.verify.mockResolvedValueOnce({ data: null, error: { code: "mfa_verification_failed", message: "Invalid TOTP code entered" } });
    await expect(verifyAdminSignInCode("phone-1", "123456")).resolves.toEqual({ error: MFA_WRONG_CODE });

    state.challenge.mockResolvedValueOnce({ data: null, error: { code: "mfa_challenge_expired", message: "MFA challenge expired" } });
    await expect(verifyAdminSignInCode("phone-1", "123456")).resolves.toEqual({ error: MFA_EXPIRED_CODE });

    state.challenge.mockResolvedValueOnce({
      data: null,
      error: { status: 429, code: "over_request_rate_limit", message: "Request rate limit reached" },
    });
    await expect(verifyAdminSignInCode("phone-1", "123456")).resolves.toEqual({ error: MFA_RATE_LIMIT });
  });

  it("does not remove the last factor while the flag is on, even at aal2", async () => {
    state.rpc.mockResolvedValue({ data: true, error: null });
    assurance("aal2", "aal2");
    await expect(removeAdminFactor("phone-1")).resolves.toEqual({
      error: expect.stringMatching(/last authenticator/i),
    });
    expect(state.unenroll).not.toHaveBeenCalled();
  });

  it("removes a backup factor at aal2 while the flag is on", async () => {
    const backup = { ...phone, id: "tablet-1", friendly_name: "Tablet" };
    state.listFactors.mockResolvedValue({
      data: { all: [phone, backup], totp: [phone, backup], phone: [] },
      error: null,
    });
    state.rpc.mockResolvedValue({ data: true, error: null });
    assurance("aal2", "aal2");
    state.unenroll.mockResolvedValue({ data: { id: "tablet-1" }, error: null });
    await expect(removeAdminFactor("tablet-1")).resolves.toEqual({ error: null });
    expect(state.unenroll).toHaveBeenCalledWith({ factorId: "tablet-1" });
  });

  it("refuses removal at aal1", async () => {
    assurance("aal1", "aal2");
    await expect(removeAdminFactor("phone-1")).resolves.toEqual({
      error: expect.stringMatching(/before removing/i),
    });
    expect(state.unenroll).not.toHaveBeenCalled();
  });
});
