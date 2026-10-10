import { describe, expect, it } from "vitest";
import { notificationPath } from "../notifications/policy";
import {
  contractorHiredLandingPath,
  customerFirstNameFromLabel,
  hiredJobChip,
  hiredJobNextStep,
  sortHiredJobCards,
  toHiredJobCard,
} from "./hiredJobs";

describe("hired job cards", () => {
  it("maps each hired status to a chip, PPP number, first name, city, and next step", () => {
    expect(
      hiredJobChip({ bookingStatus: "PENDING", customerHiredAt: null, contractorHiredAt: null }),
    ).toBe("Hired");
    expect(
      hiredJobChip({
        bookingStatus: "CONFIRMED",
        customerHiredAt: "2026-04-02T15:00:00.000Z",
        contractorHiredAt: "2026-04-02T16:00:00.000Z",
      }),
    ).toBe("Confirmed");
    expect(hiredJobChip({ bookingStatus: "IN_PROGRESS" })).toBe("In progress");
    expect(hiredJobChip({ bookingStatus: "COMPLETED" })).toBe("Completed");
    expect(hiredJobChip({ bookingStatus: "CANCELLED" })).toBeNull();

    expect(hiredJobNextStep({ bookingStatus: "PENDING", contractorHiredAt: null })).toBe("Confirm hired.");
    expect(
      hiredJobNextStep({
        bookingStatus: "PENDING",
        contractorHiredAt: "2026-04-02T16:00:00.000Z",
        customerHiredAt: null,
      }),
    ).toBe("Waiting for the homeowner to confirm Hired.");
    expect(
      hiredJobNextStep({
        bookingStatus: "CONFIRMED",
        customerHiredAt: "2026-04-02T15:00:00.000Z",
        contractorHiredAt: "2026-04-02T16:00:00.000Z",
      }),
    ).toBe("Start the job when you are ready.");
    expect(hiredJobNextStep({ bookingStatus: "IN_PROGRESS", pendingChangeOrders: 1 })).toBe("Review the change order.");
    expect(hiredJobNextStep({ bookingStatus: "COMPLETED" })).toBe("This job is complete.");

    const card = toHiredJobCard({
      bookingId: "book-1",
      projectId: "proj-1",
      bookingStatus: "IN_PROGRESS",
      customerHiredAt: "2026-04-02T15:00:00.000Z",
      contractorHiredAt: "2026-04-02T16:00:00.000Z",
      title: "Fence repair",
      referenceNumber: 1042,
      city: "Atlanta",
      customerLabel: "Christopher",
      pendingChangeOrders: 1,
    });
    expect(card).toMatchObject({
      customerFirstName: "Christopher",
      city: "Atlanta",
      chip: "In progress",
      referenceNumber: 1042,
      href: "/app/pro/jobs/book-1",
      nextStep: "Review the change order.",
      startLabel: null,
    });
    expect(
      toHiredJobCard({
        bookingId: "book-1",
        projectId: "proj-1",
        bookingStatus: "IN_PROGRESS",
        title: "Fence repair",
        startAt: "2026-04-10",
      })?.startLabel,
    ).toBe("Fri, Apr 10");
    expect(customerFirstNameFromLabel(null)).toBe("Customer");
    expect(customerFirstNameFromLabel("Customer")).toBe("Customer");
  });

  it("sorts active work ahead of completed jobs", () => {
    const cards = [
      toHiredJobCard({
        bookingId: "done",
        projectId: "p1",
        bookingStatus: "COMPLETED",
        title: "Paint",
        city: "Atlanta",
      }),
      toHiredJobCard({
        bookingId: "go",
        projectId: "p2",
        bookingStatus: "IN_PROGRESS",
        title: "Fence",
        city: "Decatur",
      }),
      toHiredJobCard({
        bookingId: "new",
        projectId: "p3",
        bookingStatus: "PENDING",
        title: "Deck",
        city: "Atlanta",
      }),
    ].flatMap((card) => (card ? [card] : []));
    expect(sortHiredJobCards(cards).map((card) => card.bookingId)).toEqual(["go", "new", "done"]);
  });

  it("sends hired notification and message links to the job page", () => {
    expect(
      notificationPath({
        kind: "booking.hired",
        entityId: "book-1",
        payload: { project_id: "proj-1", booking_id: "book-1", path: "/app/pro/bookings/book-1" },
        accountType: "CONTRACTOR",
      }),
    ).toBe("/app/pro/jobs/book-1");
    expect(
      notificationPath({
        kind: "estimate.accepted",
        entityId: "est-1",
        payload: { project_id: "proj-1" },
        accountType: "CONTRACTOR",
      }),
    ).toBe("/app/pro/jobs/project/proj-1");
    expect(
      notificationPath({
        kind: "booking.hired",
        entityId: "book-1",
        payload: { booking_id: "book-1", path: "/app/customer/bookings/book-1" },
        accountType: "CUSTOMER",
      }),
    ).toBe("/app/customer/bookings/book-1");
    expect(
      notificationPath({
        kind: "contact.shared",
        entityId: null,
        payload: { project_id: "proj-1", contractor_profile_id: "pro-1", booking_id: "book-1" },
        accountType: "CONTRACTOR",
      }),
    ).toBe("/app/pro/jobs/book-1");
    expect(
      notificationPath({
        kind: "message.received",
        entityId: null,
        payload: { project_id: "proj-1", contractor_profile_id: "pro-1", booking_id: "book-1" },
        accountType: "CONTRACTOR",
      }),
    ).toBe("/app/pro/messages/proj-1/pro-1");
    expect(
      contractorHiredLandingPath({
        kind: "message.received",
        path: "/app/pro/messages/proj-1/pro-1",
        payload: { project_id: "proj-1", contractor_profile_id: "pro-1" },
        bookings: [{ id: "book-1", project_id: "proj-1", status: "IN_PROGRESS" }],
      }),
    ).toBe("/app/pro/messages/proj-1/pro-1");
    expect(
      contractorHiredLandingPath({
        kind: "message.received",
        path: "/app/pro/messages/proj-9/pro-1",
        payload: { project_id: "proj-9" },
        bookings: [{ id: "book-1", project_id: "proj-1", status: "IN_PROGRESS" }],
      }),
    ).toBe("/app/pro/messages/proj-9/pro-1");
  });
});
