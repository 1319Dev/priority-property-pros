import { describe, expect, it } from "vitest";
import {
  MFA_EXPIRED_CODE,
  MFA_GENERIC,
  MFA_RATE_LIMIT,
  MFA_WRONG_CODE,
  canUnenrollVerifiedFactor,
  decideAdminMfaGate,
  digitsOnly,
  friendlyMfaError,
  totpQrSrc,
} from "./adminMfa";

describe("admin MFA gate", () => {
  it("lets an admin through when the flag is off and no factor is enrolled", () => {
    expect(
      decideAdminMfaGate({
        mfaRequired: false,
        assuranceKnown: true,
        currentLevel: "aal1",
        nextLevel: "aal1",
      }),
    ).toBe("allow");
  });

  it("challenges an admin who already has a verified factor even while the flag is off", () => {
    expect(
      decideAdminMfaGate({
        mfaRequired: false,
        assuranceKnown: true,
        currentLevel: "aal1",
        nextLevel: "aal2",
      }),
    ).toBe("challenge");
  });

  it("lets an aal2 admin through when the flag is on", () => {
    expect(
      decideAdminMfaGate({
        mfaRequired: true,
        assuranceKnown: true,
        currentLevel: "aal2",
        nextLevel: "aal2",
      }),
    ).toBe("allow");
  });

  it("blocks admin pages when the flag is on and there is no verified factor", () => {
    expect(
      decideAdminMfaGate({
        mfaRequired: true,
        assuranceKnown: true,
        currentLevel: "aal1",
        nextLevel: "aal1",
      }),
    ).toBe("blocked");
  });

  it("still challenges when the flag is on and a factor is waiting", () => {
    expect(
      decideAdminMfaGate({
        mfaRequired: true,
        assuranceKnown: true,
        currentLevel: null,
        nextLevel: "aal2",
      }),
    ).toBe("challenge");
  });

  it("fails open when assurance cannot be read and the flag is off", () => {
    expect(
      decideAdminMfaGate({
        mfaRequired: false,
        assuranceKnown: false,
        currentLevel: null,
        nextLevel: null,
      }),
    ).toBe("allow");
  });

  it("fails closed when assurance cannot be read and the flag is on", () => {
    expect(
      decideAdminMfaGate({
        mfaRequired: true,
        assuranceKnown: false,
        currentLevel: null,
        nextLevel: null,
      }),
    ).toBe("blocked");
  });
});

describe("admin MFA removal", () => {
  it("refuses removal below aal2", () => {
    expect(
      canUnenrollVerifiedFactor({ currentLevel: "aal1", verifiedCount: 2, mfaRequired: false }).allowed,
    ).toBe(false);
  });

  it("refuses removal of the last factor while enforcement is on", () => {
    const decision = canUnenrollVerifiedFactor({
      currentLevel: "aal2",
      verifiedCount: 1,
      mfaRequired: true,
    });
    expect(decision.allowed).toBe(false);
    expect(decision.reason).toMatch(/last authenticator/i);
  });

  it("allows removing one of two factors at aal2 while enforcement is on", () => {
    expect(
      canUnenrollVerifiedFactor({ currentLevel: "aal2", verifiedCount: 2, mfaRequired: true }).allowed,
    ).toBe(true);
  });

  it("allows removing the last factor at aal2 while enforcement is off", () => {
    expect(
      canUnenrollVerifiedFactor({ currentLevel: "aal2", verifiedCount: 1, mfaRequired: false }).allowed,
    ).toBe(true);
  });
});

describe("admin MFA errors and QR", () => {
  it("maps wrong codes, expired challenges, and rate limits", () => {
    expect(friendlyMfaError({ code: "mfa_verification_failed", message: "Invalid TOTP code entered" })).toBe(
      MFA_WRONG_CODE,
    );
    expect(friendlyMfaError({ code: "mfa_challenge_expired", message: "challenge expired" })).toBe(MFA_EXPIRED_CODE);
    expect(friendlyMfaError({ status: 429, code: "over_request_rate_limit", message: "too many requests" })).toBe(
      MFA_RATE_LIMIT,
    );
    expect(friendlyMfaError({ message: "something else broke" })).toBe(MFA_GENERIC);
  });

  it("encodes an SVG QR and leaves a data URL alone", () => {
    expect(totpQrSrc("<svg>#secret</svg>")).toBe(
      `data:image/svg+xml;utf-8,${encodeURIComponent("<svg>#secret</svg>")}`,
    );
    expect(totpQrSrc("data:image/svg+xml;utf-8,already")).toBe("data:image/svg+xml;utf-8,already");
  });

  it("keeps only digits", () => {
    expect(digitsOnly("12a34 56")).toBe("123456");
  });
});
