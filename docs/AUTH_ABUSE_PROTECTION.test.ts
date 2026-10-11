import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const doc = readFileSync(
  path.join(path.dirname(fileURLToPath(import.meta.url)), "AUTH_ABUSE_PROTECTION.md"),
  "utf8",
);

describe("AUTH_ABUSE_PROTECTION", () => {
  it("keeps captcha off until a widget sends captchaToken", () => {
    expect(doc).toMatch(/captchaToken/);
    expect(doc).toMatch(/Do not install a CAPTCHA package/);
    expect(doc).toMatch(/Turnstile/);
    expect(doc).toMatch(/Bot and Abuse Protection/);
  });

  it("records the built-in rate limits and the Resend gap", () => {
    expect(doc).toMatch(/30 requests per 5 minutes/);
    expect(doc).toMatch(/150 requests per 5 minutes/);
    expect(doc).toMatch(/2 emails per hour/);
    expect(doc).toMatch(/Resend is not set up/);
    expect(doc).toMatch(/rate_limit_email_sent/);
    expect(doc).toMatch(/Leave IP address forwarding off/);
  });
});
