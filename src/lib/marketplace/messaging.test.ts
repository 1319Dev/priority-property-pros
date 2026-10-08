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
  deriveUnread,
  desktopEnterSends,
  formatInboxTime,
  formatMessageDay,
  inboxPreview,
  layoutThreadMessages,
  messageNotificationHref,
  newMessageFromLabel,
  sanitizeProjectMessage,
  sanitizeThreadSummary,
  sortMessageThreads,
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

  it("formats inbox time, unread, sort, and the You: preview", () => {
    const now = new Date("2026-10-08T20:22:00");
    expect(formatInboxTime("2026-10-08T20:20:00", now)).toBe("2m");
    expect(formatInboxTime("2026-10-08T20:22:00", now)).toBe("now");
    expect(formatInboxTime("2026-10-08T08:22:00", now)).toBe("8:22 AM");
    expect(formatInboxTime("2026-10-07T15:00:00", now)).toBe("Yesterday");
    expect(formatInboxTime("2026-10-05T15:00:00", now)).toBe("Oct 5");
    expect(formatMessageDay("2026-10-08T08:00:00", now)).toBe("Today");
    expect(formatMessageDay("2026-10-07T08:00:00", now)).toBe("Yesterday");
    expect(formatMessageDay("2026-10-05T08:00:00", now)).toBe("Oct 5");
    expect(inboxPreview("See you Monday.", true)).toBe("You: See you Monday.");
    expect(inboxPreview("On my way.", false)).toBe("On my way.");
    expect(deriveUnread({ lastMessageAt: "2026-10-08T12:00:00Z", lastSenderIsViewer: false, lastReadAt: null })).toBe(1);
    expect(deriveUnread({ lastMessageAt: "2026-10-08T12:00:00Z", lastSenderIsViewer: true, lastReadAt: null })).toBe(0);
    expect(
      deriveUnread({
        lastMessageAt: "2026-10-08T12:00:00Z",
        lastSenderIsViewer: false,
        lastReadAt: "2026-10-08T13:00:00Z",
      }),
    ).toBe(0);
    const sorted = sortMessageThreads([
      { last_message_at: "2026-10-01T00:00:00Z", project_title: "Older" },
      { last_message_at: null, project_title: "Empty" },
      { last_message_at: "2026-10-08T00:00:00Z", project_title: "Newer" },
    ]);
    expect(sorted.map((row) => row.project_title)).toEqual(["Newer", "Older", "Empty"]);
    expect(desktopEnterSends(true, "Enter", false)).toBe(true);
    expect(desktopEnterSends(true, "Enter", true)).toBe(false);
    expect(desktopEnterSends(false, "Enter", false)).toBe(false);
    expect(newMessageFromLabel("Cedar Fence Co")).toBe("New message from Cedar Fence Co");
    const laid = layoutThreadMessages({
      viewerId: "me",
      otherLabel: "Pat",
      now,
      messages: [
        { id: "a", sender_profile_id: "pat", body: "Hi", created_at: "2026-10-08T12:00:00" },
        { id: "b", sender_profile_id: "pat", body: "Still here", created_at: "2026-10-08T12:01:00" },
        { id: "c", sender_profile_id: "me", body: "Ok", created_at: "2026-10-08T12:02:00" },
      ],
    });
    expect(laid.filter((item) => item.kind === "day").map((item) => item.label)).toEqual(["Today"]);
    expect(laid.filter((item) => item.kind === "message").map((item) => item.showLabel)).toEqual([true, false, true]);
  });

  it("tells people a thread opens after a pro connects, not from activation or Hired", () => {
    expect(MESSAGES_EMPTY_BODY).toMatch(/connects on your project/i);
    expect(MESSAGES_EMPTY_BODY).not.toMatch(/\$9\.99/);
    expect(MESSAGES_EMPTY_BODY).not.toMatch(/Hired/);
    expect(MESSAGES_LOCKED_BODY).toMatch(/connects on the project/i);
  });
});
