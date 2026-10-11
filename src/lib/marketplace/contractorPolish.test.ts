import { describe, expect, it } from "vitest";
import {
  CONTRACTOR_CONNECT_ALERT,
  CONTRACTOR_CONTACT_LOCKED_COPY,
  HOW_FEES_WORK_BODY,
  HOW_FEES_WORK_SUMMARY,
  accountRoleNote,
  activationStatusLine,
  changeOrderAmountLabel,
  changeOrderStatusLabel,
  customerPlaceLine,
  formatPhoneDisplay,
  friendlyTimestamp,
  serviceAreaBaseZip,
  hiredProjectIdSet,
  noticeBody,
  noticeProjectLine,
  notificationCategoryDescription,
  projectContactFromRpc,
} from "./contractorPolish";

describe("contractor account and fee copy", () => {
  it("names the signed-in role", () => {
    expect(accountRoleNote("CONTRACTOR")).toBe("Your role is Contractor. This site cannot change it.");
    expect(accountRoleNote("CUSTOMER")).toBe("Your role is Customer. This site cannot change it.");
  });

  it("reads activation from the profile status", () => {
    expect(activationStatusLine({ status: "PAID", paidAt: "2026-03-12T15:00:00.000Z" }).text).toMatch(
      /^Activation: Paid on /,
    );
    expect(activationStatusLine({ status: "PAID", paidAt: null })).toEqual({
      text: "Activation: Paid",
      showActivate: false,
    });
    expect(activationStatusLine({ status: "NOT_REQUIRED" })).toEqual({
      text: "Activation: Not required",
      showActivate: false,
    });
    expect(activationStatusLine({ status: "UNPAID" })).toEqual({
      text: "Activation: Not activated",
      showActivate: true,
    });
  });

  it("keeps both fee amounts in one short note", () => {
    expect(HOW_FEES_WORK_SUMMARY).toMatch(/\$9\.99/);
    expect(HOW_FEES_WORK_SUMMARY).toMatch(/\$4\.99/);
    expect(HOW_FEES_WORK_BODY).toMatch(/\$9\.99/);
    expect(HOW_FEES_WORK_BODY).toMatch(/\$4\.99/);
    expect(HOW_FEES_WORK_BODY).toMatch(/non-refundable/i);
    expect(HOW_FEES_WORK_BODY).not.toMatch(/approve or verify yourself/i);
  });
});

describe("hired jobs stay off the open list", () => {
  it("collects project ids that already have a hired booking", () => {
    const ids = hiredProjectIdSet([
      { project_id: "hired", status: "IN_PROGRESS", customer_hired_at: "t", contractor_hired_at: "t" },
      { project_id: "open", status: "CANCELLED" },
    ]);
    expect(ids.has("hired")).toBe(true);
    expect(ids.has("open")).toBe(false);
  });
});

describe("project contact from the booking RPC", () => {
  it("shows shared fields and a waiting state without mentioning Connect", () => {
    expect(CONTRACTOR_CONTACT_LOCKED_COPY).not.toMatch(/clicking connect/i);
    expect(
      projectContactFromRpc({
        unlocked: true,
        customer_shared: true,
        first_name: "Garrett",
        last_name: "Lee",
        street_line1: "12 Oak St",
        phone: "404-555-0100",
        email: "garrett@example.com",
      }),
    ).toEqual({
      state: "shared",
      contact: {
        name: "Garrett Lee",
        street: "12 Oak St",
        phone: "404-555-0100",
        email: "garrett@example.com",
      },
    });
    expect(projectContactFromRpc({ unlocked: true, customer_shared: false }).state).toBe("waiting");
    expect(
      projectContactFromRpc({
        unlocked: true,
        customer_shared: false,
        contact_access_status: "UNLOCKED",
        phone: "404-555-0100",
        email: "secret@example.com",
      }).state,
    ).toBe("waiting");
    expect(projectContactFromRpc({ unlocked: false, contact_access_status: "LOCKED" }).state).toBe("locked");
    expect(projectContactFromRpc(null).state).toBe("locked");
  });
});

describe("status words and notices", () => {
  it("says Declined and treats a $0 change as no price change", () => {
    expect(changeOrderStatusLabel("REJECTED")).toBe("Declined");
    expect(changeOrderStatusLabel("APPROVED")).toBe("Approved");
    expect(changeOrderAmountLabel(0, () => "$0.00")).toBe("No price change");
    expect(changeOrderAmountLabel(18000, (cents) => `$${(cents / 100).toFixed(2)}`)).toBe("$180.00");
  });

  it("labels the customer and drops a repeated notification body", () => {
    expect(customerPlaceLine("Garrett", "Conroe")).toBe("Customer · Garrett · Conroe");
    expect(customerPlaceLine("Customer", "Conroe")).toBe("Customer · Conroe");
    expect(noticeBody("New message", "New message")).toBeNull();
    expect(noticeBody("New message", "New message from Garrett.")).toBe("New message from Garrett.");
    expect(
      noticeProjectLine({ project_title: "Fence repair", project_reference_number: 1004 }),
    ).toBe("Fence repair · PPP-1004");
    expect(noticeProjectLine({ project_id: "p1" })).toBeNull();
  });

  it("uses a contractor label for connection alerts", () => {
    expect(notificationCategoryDescription("connect", "CONTRACTOR")).toBe(CONTRACTOR_CONNECT_ALERT);
    expect(notificationCategoryDescription("connect", "CONTRACTOR")).not.toMatch(/a pro connects on your project/i);
    expect(notificationCategoryDescription("connect", "CUSTOMER")).toMatch(/a pro connects on your project/i);
  });

  it("formats a phone and prefills a base ZIP from saved area data", () => {
    expect(formatPhoneDisplay("4045550199")).toBe("(404) 555-0199");
    expect(formatPhoneDisplay("+1 404-555-0199")).toBe("(404) 555-0199");
    expect(serviceAreaBaseZip({ center_zip: null, zip_codes: ["77301"], label: "25 miles of Conroe" })).toBe("77301");
    expect(serviceAreaBaseZip({ center_zip: "30318", zip_codes: ["77301"] })).toBe("30318");
  });

  it("formats a recent time without seconds", () => {
    const now = new Date("2026-10-04T18:19:48.000Z");
    expect(friendlyTimestamp("2026-10-04T18:19:10.000Z", now)).toBe("Just now");
    expect(friendlyTimestamp("2026-10-01T18:19:48.000Z", now)).toMatch(/2026/);
  });
});
