import { describe, expect, it } from "vitest";
import { PRE_HIRE_CONTACT_MESSAGE } from "./antiCircumvention";
import { unauthorizedPayloadLeaksPrivateContact } from "./bookings";
import {
  MESSAGE_NOTIFICATION_BODY,
  MESSAGES_EMPTY_BODY,
  MESSAGES_LOCKED_BODY,
  assertMessageBodyAllowed,
  canMessageProjectPair,
  connectionEntitlementUnlocksMessages,
  customerFacingMessageError,
  messageNotificationHref,
  sanitizeProjectMessage,
  sanitizeThreadSummary,
  type ConnectionEntitlement,
  type MessageActor,
} from "./messaging";

const owner: MessageActor = { userId: "cust-1", role: "customer", contractorProfileId: null };
const pro: MessageActor = { userId: "pro-user", role: "contractor", contractorProfileId: "pro-1" };
const otherPro: MessageActor = { userId: "pro-user-2", role: "contractor", contractorProfileId: "pro-2" };
const unlocked: ConnectionEntitlement = {
  status: "UNLOCKED",
  grantSource: "CONNECTION_FEE_PAYMENT",
  revoked: false,
};

function pair(actor: MessageActor, entitlement: ConnectionEntitlement | null, extra: Record<string, unknown> = {}) {
  return canMessageProjectPair({
    actor,
    projectOwnerId: "cust-1",
    contractorProfileId: "pro-1",
    entitlement,
    ...extra,
  });
}

describe("project message entitlement", () => {
  it("lets the homeowner and that contractor send after the $4.99 unlock", () => {
    expect(connectionEntitlementUnlocksMessages(unlocked)).toBe(true);
    expect(pair(owner, unlocked)).toBe(true);
    expect(pair(pro, unlocked)).toBe(true);
  });

  it("denies both sides before unlock", () => {
    expect(pair(owner, null)).toBe(false);
    expect(pair(pro, null)).toBe(false);
    expect(pair(owner, { status: "LOCKED", grantSource: "SYSTEM", revoked: false })).toBe(false);
    expect(pair(pro, { status: "LOCKED", grantSource: "SYSTEM", revoked: false })).toBe(false);
  });

  it("denies a different contractor on the same project", () => {
    expect(pair(otherPro, unlocked)).toBe(false);
  });

  it("does not unlock from activation, Hired, or job-payment status alone", () => {
    expect(pair(owner, null, { signupFeePaid: true, mutuallyHired: true, bookingStatus: "CONFIRMED" })).toBe(false);
    expect(pair(pro, null, { signupFeePaid: true, mutuallyHired: true, bookingStatus: "AWAITING_PAYMENT" })).toBe(false);
    expect(
      pair(owner, { status: "UNLOCKED", grantSource: "SYSTEM", revoked: false }, { signupFeePaid: true }),
    ).toBe(false);
    expect(connectionEntitlementUnlocksMessages({ status: "UNLOCKED", grantSource: "SYSTEM", revoked: false })).toBe(
      false,
    );
  });

  it("closes a revoked connection entitlement", () => {
    expect(pair(owner, { ...unlocked, revoked: true })).toBe(false);
    expect(pair(pro, { ...unlocked, revoked: true })).toBe(false);
  });

  it("allows an admin override of the same pair and nobody else", () => {
    const override: ConnectionEntitlement = { status: "ADMIN_OVERRIDE", grantSource: "ADMIN_OVERRIDE", revoked: false };
    expect(pair(owner, override)).toBe(true);
    expect(pair(pro, override)).toBe(true);
    expect(pair(otherPro, override)).toBe(false);
  });
});

describe("message privacy", () => {
  it("blocks phone, email, and street in the body even after unlock", () => {
    expect(() => assertMessageBodyAllowed("See you Monday morning.")).not.toThrow();
    expect(() => assertMessageBodyAllowed("Email me at pat@example.com")).toThrow(PRE_HIRE_CONTACT_MESSAGE);
    expect(() => assertMessageBodyAllowed("Call 404-555-0199")).toThrow(PRE_HIRE_CONTACT_MESSAGE);
    expect(() => assertMessageBodyAllowed("12 Oak Street is the gate")).toThrow(PRE_HIRE_CONTACT_MESSAGE);
  });

  it("does not echo contact details from a server error", () => {
    expect(customerFacingMessageError("messaging is locked until the $4.99 connection entitlement")).toBe(
      MESSAGES_LOCKED_BODY,
    );
    expect(customerFacingMessageError("violates row level security phone 404-555-0199 pat@example.com")).toBe(
      "Could not send that message.",
    );
    expect(customerFacingMessageError("Could not send that message.")).not.toMatch(/404|@/);
  });

  it("drops phone, email, and street from thread and message payloads", () => {
    const thread = sanitizeThreadSummary({
      thread_id: "t1",
      project_id: "p1",
      contractor_profile_id: "pro-1",
      project_title: "Fence repair",
      city: "Decatur",
      state: "GA",
      contractor_label: "Approved Fence Pro",
      phone: "404-555-0199",
      email: "pat@example.com",
      street: "12 Oak Street",
      business_name: "Secret LLC",
    });
    expect(thread?.project_title).toBe("Fence repair");
    expect(JSON.stringify(thread)).not.toMatch(/404|pat@example|Oak Street|Secret LLC/);

    const message = sanitizeProjectMessage({
      id: "m1",
      thread_id: "t1",
      sender_profile_id: "cust-1",
      body: "Monday works.",
      created_at: "2026-10-05T12:00:00Z",
      phone: "404-555-0199",
      email: "pat@example.com",
    });
    expect(message).toEqual({
      id: "m1",
      thread_id: "t1",
      sender_profile_id: "cust-1",
      body: "Monday works.",
      created_at: "2026-10-05T12:00:00Z",
    });
  });

  it("keeps new-message notifications free of contact fields", () => {
    expect(unauthorizedPayloadLeaksPrivateContact({ title: "New message", body: MESSAGE_NOTIFICATION_BODY })).toBe(
      false,
    );
    expect(MESSAGE_NOTIFICATION_BODY).not.toMatch(/@|\d{3}/);
    const href = messageNotificationHref("customer", {
      project_id: "p1",
      contractor_profile_id: "pro-1",
      phone: "404-555-0199",
      email: "pat@example.com",
    });
    expect(href).toBe("/app/customer/messages/p1/pro-1");
    expect(href).not.toMatch(/404|@/);
    expect(messageNotificationHref("contractor", { project_id: "p1" })).toBeNull();
  });

  it("tells people activation and Hired do not open a thread", () => {
    expect(MESSAGES_EMPTY_BODY).toMatch(/\$4\.99/);
    expect(MESSAGES_EMPTY_BODY).toMatch(/\$9\.99/);
    expect(MESSAGES_EMPTY_BODY).toMatch(/Hired/);
    expect(MESSAGES_EMPTY_BODY).toMatch(/job payment/i);
  });
});
