import { describe, expect, it } from "vitest";
import {
  EMAIL_CHANGE_GENERIC_MESSAGE,
  EMAIL_CHANGE_NETWORK_MESSAGE,
  EMAIL_CHANGE_PASSWORD_MESSAGE,
  EMAIL_CHANGE_RATE_LIMIT_MESSAGE,
  EMAIL_CHANGE_UNUSABLE_MESSAGE,
  emailChangeErrorMessage,
  emailChangeFieldErrors,
} from "./emailChange";

describe("emailChangeFieldErrors", () => {
  it("requires a new email and the current password", () => {
    expect(emailChangeFieldErrors("", "", "pat@example.com")).toEqual({
      email: "Enter the new email.",
      password: "Enter your current password.",
    });
  });

  it("rejects a malformed address and the address already on the account", () => {
    expect(emailChangeFieldErrors("not-an-email", "secret", "pat@example.com").email).toMatch(/name@example.com/);
    expect(emailChangeFieldErrors(" Pat@Example.com ", "secret", "pat@example.com").email).toMatch(/already/);
  });

  it("accepts a different address", () => {
    expect(emailChangeFieldErrors("next@example.com", "secret", "pat@example.com")).toEqual({});
  });
});

describe("emailChangeErrorMessage", () => {
  it("uses one password message for a failed reauth and does not echo the Auth text", () => {
    const message = emailChangeErrorMessage(
      { message: "Invalid login credentials", code: "invalid_credentials", status: 400 },
      "reauth",
    );
    expect(message).toBe(EMAIL_CHANGE_PASSWORD_MESSAGE);
    expect(message).not.toMatch(/Invalid login/);
  });

  it("separates rate limit, network, and an address Auth will not take", () => {
    expect(emailChangeErrorMessage({ status: 429, message: "over_request_rate_limit" }, "update")).toBe(
      EMAIL_CHANGE_RATE_LIMIT_MESSAGE,
    );
    expect(emailChangeErrorMessage({ name: "AuthRetryableFetchError", message: "Failed to fetch", status: 0 }, "update")).toBe(
      EMAIL_CHANGE_NETWORK_MESSAGE,
    );
    expect(emailChangeErrorMessage({ code: "email_exists", message: "User already registered" }, "update")).toBe(
      EMAIL_CHANGE_UNUSABLE_MESSAGE,
    );
    expect(emailChangeErrorMessage({ message: "duplicate key value violates unique constraint" }, "update")).toBe(
      EMAIL_CHANGE_GENERIC_MESSAGE,
    );
  });
});
