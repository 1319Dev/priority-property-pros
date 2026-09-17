import { describe, expect, it } from "vitest";
import {
  contractorNotificationForStatus,
  customerNotificationForSubmit,
  customerNotificationForWithdraw,
  notificationChannel,
  notificationForFirstView,
  NOTIFICATION_CATALOG,
  shouldNotifyRepeatView,
} from "./notifications";

describe("in-app notifications", () => {
  it("notifies the contractor once on first VIEWED, plus ACCEPTED and distinct not-selected copy", () => {
    expect(notificationForFirstView(true)).toBe("estimate.viewed");
    expect(notificationForFirstView(false)).toBeNull();
    expect(shouldNotifyRepeatView(true)).toBe(false);
    expect(contractorNotificationForStatus("VIEWED")).toBe("estimate.viewed");
    expect(contractorNotificationForStatus("ACCEPTED")).toBe("estimate.accepted");
    expect(contractorNotificationForStatus("DECLINED", "CUSTOMER_DECLINED")).toBe("estimate.declined");
    expect(contractorNotificationForStatus("DECLINED", "ANOTHER_ESTIMATE_ACCEPTED")).toBe(
      "estimate.not_selected",
    );
    expect(NOTIFICATION_CATALOG["estimate.viewed"].body).toBe("Your estimate was viewed.");
    expect(NOTIFICATION_CATALOG["estimate.accepted"].body).toBe("The customer selected your estimate.");
    expect(NOTIFICATION_CATALOG["estimate.declined"].body).toBe(
      "The customer decided not to move forward with your estimate.",
    );
    expect(NOTIFICATION_CATALOG["estimate.not_selected"].body).toBe(
      "The customer selected another pro for this project.",
    );
    expect(NOTIFICATION_CATALOG["estimate.declined"].body).not.toMatch(/another pro/i);
    expect(NOTIFICATION_CATALOG["estimate.viewed"].oncePerEntity).toBe(true);
  });

  it("notifies the customer on receive, post-submit update, and withdraw", () => {
    expect(customerNotificationForSubmit("DRAFT", "SENT")).toBe("estimate.received");
    expect(customerNotificationForSubmit("SENT", "REVISED")).toBe("estimate.updated");
    expect(customerNotificationForWithdraw("WITHDRAWN")).toBe("estimate.withdrawn");
    expect(customerNotificationForSubmit("DRAFT", "VIEWED")).toBeNull();
  });

  it("is in-app first and extensible without email/push spam hooks", () => {
    expect(notificationChannel()).toBe("in_app");
    expect(Object.keys(NOTIFICATION_CATALOG)).toEqual(
      expect.arrayContaining([
        "estimate.viewed",
        "estimate.accepted",
        "estimate.declined",
        "estimate.not_selected",
        "estimate.received",
        "estimate.updated",
        "estimate.withdrawn",
      ]),
    );
  });
});
