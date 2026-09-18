import { describe, expect, it } from "vitest";
import {
  assertNoPreHireContact,
  containsPreHireContact,
  findPreHireContact,
  PRE_HIRE_CONTACT_MESSAGE,
  preConnectionContactBlocked,
  preHireContactError,
} from "./antiCircumvention";
import { connectionFeeCents } from "./connectionFee";
import { CHARGES_LIVE, PAYMENTS_LIVE } from "./types";

describe("pre-hire anti-circumvention", () => {
  it("rejects obvious phones, emails, URLs, and social handles", () => {
    expect(findPreHireContact("Need the fence fixed. Call 512-555-0199")).toBe("phone");
    expect(findPreHireContact("I can start Tuesday. Email me at pro@example.com")).toBe("email");
    expect(findPreHireContact("Licensed handyman. More at https://mycrew.com")).toBe("url");
    expect(findPreHireContact("Reach us at (713) 555-0100")).toBe("phone");
    expect(findPreHireContact("Text 5125550199")).toBe("phone");
    expect(findPreHireContact("Website www.priorityfence.net")).toBe("url");
    expect(findPreHireContact("Find us on facebook.com/joesfence")).toBe("url");
    expect(findPreHireContact("DM @joesfence on Instagram")).toBe("social");
    expect(findPreHireContact("Headline: text me 7135550144")).toBe("phone");
    expect(findPreHireContact("Service caption: more at mycrew.io/book")).toBe("url");
  });

  it("blocks exact street and QR mentions without flagging ordinary project copy", () => {
    expect(findPreHireContact("Meet me at 123 Oak Street after lunch.")).toBe("street");
    expect(findPreHireContact("Scan the QR code on my truck.")).toBe("qr");
    expect(containsPreHireContact("Replace 40 ft of cedar fence before the weekend.")).toBe(false);
    expect(containsPreHireContact("Need 8-10 ft gate hardware and 2x4 bracing.")).toBe(false);
  });

  it("allows ordinary project copy without contact", () => {
    expect(containsPreHireContact("Replace 40 ft of cedar fence before the weekend.")).toBe(false);
    expect(containsPreHireContact("Need 8-10 ft gate hardware and 2x4 bracing.")).toBe(false);
    expect(containsPreHireContact("Independent local contractor.")).toBe(false);
    expect(preHireContactError("Mount a 65 inch TV above the fireplace.")).toBeNull();
  });

  it("uses the privacy copy when blocking", () => {
    expect(preHireContactError("Call 713-555-0142")).toBe(PRE_HIRE_CONTACT_MESSAGE);
    expect(() => assertNoPreHireContact("owner@example.com")).toThrow(PRE_HIRE_CONTACT_MESSAGE);
    expect(() => assertNoPreHireContact("Need a new gate latch.")).not.toThrow();
  });

  it("does not incorrectly block connected / entitled parties", () => {
    expect(preConnectionContactBlocked("Call 713-555-0142", true)).toBe(false);
    expect(preConnectionContactBlocked("Call 713-555-0142", false)).toBe(true);
  });

  it("keeps the $4.99 connection price and payments off", () => {
    expect(connectionFeeCents()).toBe(499);
    expect(PAYMENTS_LIVE).toBe(false);
    expect(CHARGES_LIVE).toBe(false);
  });
});
