import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";
import type { ComparisonViewRow } from "./EstimateComparison";
import { EstimateComparison } from "./EstimateComparison";

const rows: ComparisonViewRow[] = [
  {
    id: "high",
    businessName: "Northside Fence Co.",
    totalCents: 180000,
    lineItems: [{ id: "h1", label: "Labor: reset the fence" }],
    timelineLabel: "6 hours",
    startLabel: "2026-04-10",
    ratingAverage: 4.9,
    ratingCount: 12,
    ratingLabel: "4.9 · 12 reviews",
    badges: ["Approved platform profile"],
    submittedAt: "2026-04-01T00:00:00.000Z",
    selectable: true,
    declinable: true,
    selected: false,
    outOfDate: false,
    statusLabel: "Sent",
  },
  {
    id: "low",
    businessName: "Oak Street Repairs",
    totalCents: 90000,
    lineItems: [{ id: "l1", label: "Labor: reset the fence" }, { id: "l2", label: "Haul-away" }],
    timelineLabel: "12 hours",
    startLabel: "2026-04-20",
    ratingAverage: null,
    ratingCount: 0,
    ratingLabel: "No reviews yet",
    badges: ["Contractor-provided license"],
    submittedAt: "2026-04-02T00:00:00.000Z",
    selectable: true,
    declinable: true,
    selected: false,
    outOfDate: false,
    statusLabel: "Sent",
  },
];

describe("Estimate comparison", () => {
  it("sorts by lowest price and best rated and keeps Hire on each estimate", async () => {
    const user = userEvent.setup();
    const onStartHire = vi.fn();
    render(
      <MemoryRouter>
        <div className="w-[390px]">
          <EstimateComparison
            rows={rows}
            confirmId={null}
            busy={false}
            bookingHref={null}
            selectedCopy="You selected this pro."
            confirmBody="Choosing this pro starts a booking."
            onStartHire={onStartHire}
            onConfirmHire={() => undefined}
            onCancelHire={() => undefined}
            onDecline={() => undefined}
          />
        </div>
      </MemoryRouter>,
    );
    const cards = screen.getByLabelText("Estimate cards");
    expect(cards.className).toContain("snap-x");
    expect(cards.textContent?.indexOf("Northside Fence Co.")).toBeLessThan(cards.textContent?.indexOf("Oak Street Repairs") ?? 0);
    await user.click(screen.getByRole("button", { name: "Lowest price" }));
    expect(cards.textContent?.indexOf("Oak Street Repairs")).toBeLessThan(cards.textContent?.indexOf("Northside Fence Co.") ?? 0);
    expect(screen.getAllByText("Lowest price").length).toBeGreaterThan(0);
    expect(screen.getAllByText("No reviews yet").length).toBeGreaterThan(0);
    await user.click(screen.getByRole("button", { name: "Best rated" }));
    expect(cards.textContent?.indexOf("Northside Fence Co.")).toBeLessThan(cards.textContent?.indexOf("Oak Street Repairs") ?? 0);
    expect(screen.getAllByText("Highest rating").length).toBeGreaterThan(0);
    await user.click(screen.getAllByRole("button", { name: "Hire" })[0]);
    expect(onStartHire).toHaveBeenCalledWith("high");
  });
});
