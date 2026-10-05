import { describe, expect, it } from "vitest";
import { PRE_HIRE_CONTACT_MESSAGE } from "./antiCircumvention";
import { unauthorizedPayloadLeaksPrivateContact } from "./bookings";
import { assertMessageBodyAllowed } from "./messaging";
import { CONTACT_SHARED_NOTIFICATION_BODY } from "./contactShare";
import {
  SHARE_CONTACT_BUTTON_LABEL,
  SHARE_CONTACT_COPY,
  SHARE_CONTACT_WAITING_COPY,
  contractorMaySeeSharedContact,
  customerFacingShareError,
  formatSharedAddress,
  jobContactWasShared,
  sanitizeSharedContact,
  shareButtonVisible,
} from "./contactShare";

const preview = {
  eligible: true,
  customer_shared: false,
  name: "Pat Lee",
  phone: "404-555-0199",
  email: "pat@example.com",
  street_line1: "12 Oak Street",
  street_line2: null,
  city: "Decatur",
  state: "GA",
  zip_code: "30030",
  lat: 33.7,
  lng: -84.3,
  business_name: "Secret LLC",
};

describe("voluntary contact share", () => {
  it("shows the customer button only after the connection is eligible and before they share", () => {
    expect(shareButtonVisible(sanitizeSharedContact(preview, "customer"))).toBe(true);
    expect(shareButtonVisible(sanitizeSharedContact({ ...preview, customer_shared: true }, "customer"))).toBe(false);
    expect(shareButtonVisible(sanitizeSharedContact({ ...preview, eligible: false }, "customer"))).toBe(false);
    expect(shareButtonVisible(null)).toBe(false);
    expect(SHARE_CONTACT_BUTTON_LABEL).toMatch(/share my contact & address/i);
    expect(SHARE_CONTACT_COPY).toMatch(/optional/i);
    expect(SHARE_CONTACT_COPY).toMatch(/name, phone, email/i);
    expect(SHARE_CONTACT_COPY).toMatch(/this connected contractor only/i);
    expect(SHARE_CONTACT_COPY).toMatch(/message box still blocks/i);
    expect(SHARE_CONTACT_COPY).toMatch(/anonymized/i);
  });

  it("keeps phone, email, and street off the contractor view until the customer shares", () => {
    const hidden = sanitizeSharedContact(preview, "contractor");
    expect(contractorMaySeeSharedContact(hidden)).toBe(false);
    expect(JSON.stringify(hidden)).not.toMatch(/404|pat@example|Oak Street|Secret LLC|33\.7/);
    expect(SHARE_CONTACT_WAITING_COPY).toMatch(/has not shared/i);
    expect(SHARE_CONTACT_WAITING_COPY).not.toMatch(/@|\d{3}-\d{3}/);

    const shown = sanitizeSharedContact({ ...preview, customer_shared: true }, "contractor");
    expect(contractorMaySeeSharedContact(shown)).toBe(true);
    expect(shown.phone).toBe("404-555-0199");
    expect(shown.email).toBe("pat@example.com");
    expect(formatSharedAddress(shown)).toBe("12 Oak Street, Decatur, GA 30030");
    expect(JSON.stringify(shown)).not.toMatch(/Secret LLC|33\.7/);
  });

  it("does not treat the connection fee alone as a shared payload", () => {
    expect(jobContactWasShared({ unlocked: true, customer_shared: false, phone: "404-555-0199" })).toBe(false);
    expect(jobContactWasShared({ customer_shared: true, phone: "404-555-0199", email: "pat@example.com" })).toBe(true);
    expect(jobContactWasShared({ phone: "404-555-0199", street_line1: "12 Oak Street" })).toBe(true);
    expect(jobContactWasShared({ unlocked: true })).toBe(false);
    expect(unauthorizedPayloadLeaksPrivateContact({ title: "Contact shared", body: CONTACT_SHARED_NOTIFICATION_BODY })).toBe(
      false,
    );
  });

  it("still blocks contact paste in a message after the share exists", () => {
    expect(() => assertMessageBodyAllowed("Monday morning works.")).not.toThrow();
    expect(() => assertMessageBodyAllowed("Email pat@example.com")).toThrow(PRE_HIRE_CONTACT_MESSAGE);
    expect(() => assertMessageBodyAllowed("12 Oak Street")).toThrow(PRE_HIRE_CONTACT_MESSAGE);
    expect(customerFacingShareError("contact share is locked until the $4.99 connection entitlement")).toMatch(/\$4\.99/);
    expect(customerFacingShareError("phone 404-555-0199 pat@example.com")).toBe("Could not share contact.");
    expect(customerFacingShareError("phone 404-555-0199 pat@example.com")).not.toMatch(/404|@/);
  });
});
