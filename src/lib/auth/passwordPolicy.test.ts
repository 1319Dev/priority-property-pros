import { describe, expect, it } from "vitest";
import { MIN_PASSWORD_LENGTH, PASSWORD_TOO_SHORT_MESSAGE, passwordPolicyError } from "./passwordPolicy";

describe("passwordPolicy", () => {
  it("rejects fewer than 8 characters and accepts 8", () => {
    expect(MIN_PASSWORD_LENGTH).toBe(8);
    expect(passwordPolicyError("short")).toBe(PASSWORD_TOO_SHORT_MESSAGE);
    expect(passwordPolicyError("1234567")).toBe(PASSWORD_TOO_SHORT_MESSAGE);
    expect(passwordPolicyError("12345678")).toBeNull();
  });

  it("does not require a character class", () => {
    expect(passwordPolicyError("aaaaaaaa")).toBeNull();
  });
});
