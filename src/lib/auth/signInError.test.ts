import { describe, expect, it } from "vitest";
import {
  SIGN_IN_GENERIC_MESSAGE,
  SIGN_IN_INVALID_MESSAGE,
  SIGN_IN_NETWORK_MESSAGE,
  SIGN_IN_RATE_LIMIT_MESSAGE,
  SIGN_IN_UNCONFIRMED_MESSAGE,
  signInErrorMessage,
  signInFieldErrors,
} from "./signInError";

describe("signInErrorMessage", () => {
  it("uses one message for a wrong email and a wrong password", () => {
    expect(signInErrorMessage({ message: "Invalid login credentials", code: "invalid_credentials", status: 400 })).toBe(
      SIGN_IN_INVALID_MESSAGE,
    );
    expect(signInErrorMessage({ message: "User not found" })).toBe(SIGN_IN_INVALID_MESSAGE);
    expect(SIGN_IN_INVALID_MESSAGE).not.toMatch(/not found|no account|which/i);
  });

  it("names an unconfirmed email, too many attempts, and a network failure", () => {
    expect(signInErrorMessage({ message: "Email not confirmed", code: "email_not_confirmed" })).toBe(
      SIGN_IN_UNCONFIRMED_MESSAGE,
    );
    expect(signInErrorMessage({ message: "Request rate limit reached", status: 429, code: "over_request_rate_limit" })).toBe(
      SIGN_IN_RATE_LIMIT_MESSAGE,
    );
    expect(signInErrorMessage({ message: "Failed to fetch", name: "AuthRetryableFetchError", status: 0 })).toBe(
      SIGN_IN_NETWORK_MESSAGE,
    );
  });

  it("hides unexpected auth text behind a generic message", () => {
    expect(signInErrorMessage({ message: "Database error querying schema" })).toBe(SIGN_IN_GENERIC_MESSAGE);
    expect(signInErrorMessage(null)).toBeNull();
  });

  it("asks for email and password inline", () => {
    expect(signInFieldErrors("", "")).toEqual({
      email: "Enter your email.",
      password: "Enter your password.",
    });
    expect(signInFieldErrors("pat@example.com", "secret")).toEqual({});
  });
});
