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
  it("notifies the contractor once on first VIEWED, plus ACCEPTED and not-selected", () => {
    expect(notificationForFirstView(true)).toBe("estimate.viewed");
    expect(notificationForFirstView(false)).toBeNull();
    expect(shouldNotifyRepeatView(true)).toBe(false);
    expect(contractorNotificationForStatus("VIEWED")).toBe("estimate.viewed");
    expect(contractorNotificationForStatus("ACCEPTED")).toBe("estimate.accepted");
    expect(contractorNotificationForStatus("DECLINED")).toBe("estimate.declined");
    expect(NOTIFICATION_CATALOG["estimate.declined"].body).toMatch(/another pro/i);
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
        "estimate.received",
        "estimate.updated",
        "estimate.withdrawn",
      ]),
    );
  });
});
