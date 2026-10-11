import { describe, expect, it } from "vitest";
import {
  dedupeNotificationRows,
  friendlyNotificationError,
  notificationIsHistorical,
  notificationProjectLine,
  safeNoticeText,
  safeNoticeTitle,
  safeProjectTitle,
} from "./presentation";

describe("notification presentation", () => {
  it("keeps a safe project title and drops contact details", () => {
    expect(safeProjectTitle("Fence repair")).toBe("Fence repair");
    expect(safeProjectTitle("Email me at pat@example.com")).toBeNull();
    expect(safeProjectTitle("Call 512-555-0199")).toBeNull();
    expect(safeProjectTitle("See https://example.com/job")).toBeNull();
    expect(safeProjectTitle("123 Main Street")).toBeNull();
    expect(safeNoticeTitle("New estimate received")).toBe("New estimate received");
    expect(safeNoticeTitle("Call 512-555-0199")).toBe("Update");
    expect(safeNoticeText("New estimate", "A pro sent an estimate on your project.")).toBe(
      "A pro sent an estimate on your project.",
    );
    expect(safeNoticeText("New estimate", "Text pat@example.com")).toBeNull();
    expect(notificationProjectLine({ projectTitle: "Fence repair", referenceNumber: 1004 })).toBe(
      "Fence repair · PPP-1004",
    );
    expect(notificationProjectLine({ projectTitle: "123 Main Street", referenceNumber: 1004 })).toBe("PPP-1004");
  });

  it("treats a finished hire as historical and trusts an explicit server state", () => {
    expect(notificationIsHistorical({ kind: "estimate.received", actionState: "historical" })).toBe(true);
    expect(
      notificationIsHistorical({
        kind: "estimate.received",
        actionState: "open",
        projectStatus: "CONTRACTOR_SELECTED",
      }),
    ).toBe(false);
    expect(notificationIsHistorical({ kind: "estimate.received", projectStatus: "CONTRACTOR_SELECTED" })).toBe(true);
    expect(notificationIsHistorical({ kind: "estimate.updated", projectStatus: "CANCELLED" })).toBe(true);
    expect(notificationIsHistorical({ kind: "estimate.received", selectedEstimateId: "est-1" })).toBe(true);
    expect(
      notificationIsHistorical({
        kind: "estimate.updated",
        projectId: "proj-1",
        bookings: [
          {
            projectId: "proj-1",
            status: "CONFIRMED",
            customerHiredAt: "2026-10-09T00:00:00.000Z",
            contractorHiredAt: "2026-10-09T00:00:00.000Z",
          },
        ],
      }),
    ).toBe(true);
    expect(
      notificationIsHistorical({
        kind: "estimate.received",
        projectId: "proj-1",
        projectStatus: "ESTIMATES_AVAILABLE",
        bookings: [
          {
            projectId: "proj-1",
            status: "CANCELLED",
            customerHiredAt: "2026-10-09T00:00:00.000Z",
            contractorHiredAt: "2026-10-09T00:00:00.000Z",
          },
        ],
      }),
    ).toBe(false);
    expect(notificationIsHistorical({ kind: "change_order.approved" })).toBe(false);
  });

  it("collapses duplicate once-per-entity rows and extra unread copies", () => {
    expect(
      dedupeNotificationRows([
        { id: "new", kind: "estimate.received", entityId: "est-1", readAt: null },
        { id: "old", kind: "estimate.received", entityId: "est-1", readAt: "2026-10-01T00:00:00.000Z" },
      ]).map((row) => row.id),
    ).toEqual(["new"]);
    expect(
      dedupeNotificationRows([
        { id: "a", kind: "message.received", entity_id: "thread-1", read_at: null },
        { id: "b", kind: "message.received", entity_id: "thread-1", read_at: null },
        { id: "c", kind: "message.received", entity_id: "thread-1", read_at: "2026-10-01T00:00:00.000Z" },
      ]).map((row) => row.id),
    ).toEqual(["a", "c"]);
  });

  it("hides database and realtime errors from the page", () => {
    expect(
      friendlyNotificationError(
        "cannot add postgres_changes callbacks for realtime:notifications:user after subscribe()",
      ),
    ).toBe("Couldn't load notifications.");
    expect(friendlyNotificationError("Could not load notifications.")).toBe("Could not load notifications.");
    expect(friendlyNotificationError(null)).toBeNull();
  });
});
