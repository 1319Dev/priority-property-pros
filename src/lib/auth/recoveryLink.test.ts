import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  DIFFERENT_BROWSER_RESET_MESSAGE,
  EXPIRED_RESET_LINK_MESSAGE,
  PASSWORD_RESET_RATE_LIMIT_MESSAGE,
  captureRecoveryLink,
  expiredResetMessage,
  getRecoveryLinkSnapshot,
  isMissingPkceVerifier,
  parseRecoveryParams,
  passwordResetRequestMessage,
  resetRecoveryLinkStateForTests,
  stripRecoveryCredentialsFromLocation,
} from "./recoveryLink";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");

describe("parseRecoveryParams", () => {
  it("reads a token_hash link", () => {
    expect(parseRecoveryParams("?token_hash=hashed-token&type=recovery", "")).toEqual({
      kind: "token_hash",
      tokenHash: "hashed-token",
      type: "recovery",
    });
  });

  it("reads a token_hash from the hash when the query is empty", () => {
    expect(parseRecoveryParams("", "#token_hash=hashed-token&type=magiclink")).toEqual({
      kind: "token_hash",
      tokenHash: "hashed-token",
      type: "magiclink",
    });
  });

  it("does not treat a token_hash without a type as a token hash", () => {
    expect(parseRecoveryParams("?token_hash=hashed-token", "")).toEqual({ kind: "none" });
  });

  it("reads a PKCE code", () => {
    expect(parseRecoveryParams("?code=auth-code", "")).toEqual({ kind: "code", code: "auth-code" });
  });

  it("reads implicit access and refresh tokens from the hash", () => {
    expect(
      parseRecoveryParams("", "#access_token=access-token&refresh_token=refresh-token&expires_in=3600&token_type=bearer&type=recovery"),
    ).toEqual({
      kind: "tokens",
      accessToken: "access-token",
      refreshToken: "refresh-token",
    });
  });

  it("reads an error from the hash and decodes the description", () => {
    expect(
      parseRecoveryParams("", "#error=access_denied&error_code=otp_expired&error_description=Email+link+is+invalid+or+has+expired"),
    ).toEqual({
      kind: "error",
      code: "otp_expired",
      description: "Email link is invalid or has expired",
    });
  });

  it("prefers an error over a code in the same URL", () => {
    expect(parseRecoveryParams("?code=auth-code&error=access_denied&error_description=Expired", "")).toEqual({
      kind: "error",
      code: "access_denied",
      description: "Expired",
    });
  });

  it("prefers a code over implicit tokens", () => {
    expect(parseRecoveryParams("?code=auth-code", "#access_token=access-token&refresh_token=refresh-token")).toEqual({
      kind: "code",
      code: "auth-code",
    });
  });

  it("returns none when the URL has no recovery params", () => {
    expect(parseRecoveryParams("", "")).toEqual({ kind: "none" });
    expect(parseRecoveryParams("?next=/app", "#section")).toEqual({ kind: "none" });
  });
});

describe("recovery link helpers", () => {
  it("keeps the latest snapshot", () => {
    resetRecoveryLinkStateForTests();
    captureRecoveryLink("?code=auth-code", "");
    expect(getRecoveryLinkSnapshot()).toEqual({ kind: "code", code: "auth-code" });
    resetRecoveryLinkStateForTests();
    expect(getRecoveryLinkSnapshot()).toEqual({ kind: "none" });
  });

  it("recognizes a missing PKCE verifier", () => {
    expect(isMissingPkceVerifier({ message: "PKCE code verifier not found in storage.", code: "pkce_code_verifier_not_found" })).toBe(true);
    expect(isMissingPkceVerifier({ message: "both auth code and code verifier should be non-empty" })).toBe(true);
    expect(isMissingPkceVerifier({ message: "Email link is invalid or has expired" })).toBe(false);
  });

  it("turns HTTP 429 into plain language", () => {
    expect(passwordResetRequestMessage({ error: "Email rate limit exceeded", status: 429 })).toBe(PASSWORD_RESET_RATE_LIMIT_MESSAGE);
    expect(passwordResetRequestMessage({ error: "For security purposes, you can only request this once every 60 seconds" })).toBe(
      PASSWORD_RESET_RATE_LIMIT_MESSAGE,
    );
    expect(passwordResetRequestMessage({ error: "Unable to send email" })).toBe("Unable to send email");
    expect(passwordResetRequestMessage({ error: null })).toBeNull();
  });

  it("includes the provider reason on an expired link", () => {
    expect(expiredResetMessage(null)).toBe(EXPIRED_RESET_LINK_MESSAGE);
    expect(expiredResetMessage("Email link is invalid or has expired")).toBe(
      `${EXPIRED_RESET_LINK_MESSAGE} Email link is invalid or has expired`,
    );
    expect(DIFFERENT_BROWSER_RESET_MESSAGE).toMatch(/different browser/);
  });

  it("strips recovery credentials from the address bar", () => {
    window.history.replaceState(null, "", "/auth/reset-password?code=auth-code#access_token=access-token&refresh_token=refresh-token");
    stripRecoveryCredentialsFromLocation();
    expect(window.location.pathname).toBe("/auth/reset-password");
    expect(window.location.search).toBe("");
    expect(window.location.hash).toBe("");
    expect(window.location.href).not.toContain("access-token");
    expect(window.location.href).not.toContain("refresh-token");
    expect(window.location.href).not.toContain("auth-code");
  });

  it("snapshots the recovery URL from main before the app renders", () => {
    const main = readFileSync(path.join(repoRoot, "src/main.tsx"), "utf8");
    const installer = readFileSync(path.join(repoRoot, "src/lib/auth/installRecoveryLinkSnapshot.ts"), "utf8");
    const installAt = main.indexOf("installRecoveryLinkSnapshot");
    expect(installAt).toBeGreaterThan(-1);
    expect(installAt).toBeLessThan(main.indexOf("createRoot"));
    expect(main.match(/import\s+[^;]+;/)?.[0]).toContain("installRecoveryLinkSnapshot");
    expect(main).not.toMatch(/getSupabaseClient/);
    expect(installer).toMatch(/captureRecoveryLink\(\s*window\.location\.search\s*,\s*window\.location\.hash\s*\)/);
  });
});
