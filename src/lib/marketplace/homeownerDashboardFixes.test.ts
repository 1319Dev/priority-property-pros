import { describe, expect, it } from "vitest";
import {
  SELECTED_BOOKING_COPY,
  SELECTED_HIRED_COPY,
  SELECTED_WAITING_PRO_COPY,
  selectedHireCopy,
} from "./customerCopy";
import { changeOrderAmountLabel } from "./contractorPolish";
import { projectPhotoAlt } from "./projectPhotoAlt";
import { customerNextActions, dashboardCardActions } from "./statusLabels";

describe("project cards link to the project page", () => {
  it("a Hired (IN_PROGRESS) project offers View booking and View project", () => {
    const actions = customerNextActions({
      projectId: "p-1004",
      projectStatus: "CONTRACTOR_SELECTED",
      bookingId: "b-1004",
      bookingStatus: "IN_PROGRESS",
      customerHiredAt: "2026-10-05T00:00:00Z",
      contractorHiredAt: "2026-10-05T00:01:00Z",
    });
    expect(actions.map((a) => [a.label, a.to])).toEqual([
      ["View booking", "/app/customer/bookings/b-1004"],
      ["View project", "/app/customer/projects/p-1004"],
    ]);
  });

  it("an active project without a booking id still links to the project", () => {
    const actions = customerNextActions({ projectId: "p1", projectStatus: "CONTRACTOR_SELECTED", bookingStatus: "CONFIRMED" });
    expect(actions.map((a) => a.label)).toEqual(["View project"]);
  });

  it("dashboard cards keep the project link even when actions are trimmed", () => {
    const trimmed = dashboardCardActions(
      [
        { label: "Confirm hired", to: "/b" },
        { label: "View booking", to: "/b" },
        { label: "Message pro", to: "/m" },
        { label: "View project", to: "/p" },
      ],
      3,
    );
    expect(trimmed.map((a) => a.label)).toEqual(["Confirm hired", "View booking", "View project"]);
    expect(dashboardCardActions([{ label: "Compare estimates", to: "/c" }]).map((a) => a.label)).toEqual(["Compare estimates"]);
  });
});

describe("hire copy follows the booking", () => {
  it("does not ask to confirm once both sides confirmed Hired", () => {
    expect(
      selectedHireCopy({ status: "IN_PROGRESS", customer_hired_at: "2026-10-05T00:00:00Z", contractor_hired_at: "2026-10-05T00:01:00Z" }),
    ).toBe(SELECTED_HIRED_COPY);
    expect(SELECTED_HIRED_COPY).not.toMatch(/to confirm/i);
    expect(selectedHireCopy({ status: "CONFIRMED" })).toBe(SELECTED_HIRED_COPY);
  });

  it("asks to confirm only while confirmation is still needed", () => {
    expect(selectedHireCopy(null)).toBe(SELECTED_BOOKING_COPY);
    expect(selectedHireCopy({ status: "PENDING" })).toBe(SELECTED_BOOKING_COPY);
    expect(selectedHireCopy({ status: "PENDING", customer_hired_at: "2026-10-05T00:00:00Z" })).toBe(SELECTED_WAITING_PRO_COPY);
  });
});

describe("small homeowner labels", () => {
  it("change orders with no price change say the price stays the same", () => {
    expect(changeOrderAmountLabel(0, () => "$0.00")).toBe("Scope change, price stays the same");
    expect(changeOrderAmountLabel(18000, (cents) => `$${(cents / 100).toFixed(2)}`)).toBe("$180.00");
  });

  it("project photos get alt text", () => {
    expect(projectPhotoAlt(0, 1)).toBe("Project photo");
    expect(projectPhotoAlt(1, 3)).toBe("Project photo 2 of 3");
  });
});
