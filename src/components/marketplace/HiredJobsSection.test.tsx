import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it } from "vitest";
import { toHiredJobCard } from "../../lib/marketplace/hiredJobs";
import { HiredJobsSection } from "./HiredJobsSection";

describe("Hired jobs section", () => {
  it("shows the PPP number, customer first name, city, status, next step, and Open job", () => {
    const job = toHiredJobCard({
      bookingId: "book-1",
      projectId: "proj-1",
      bookingStatus: "CONFIRMED",
      customerHiredAt: "2026-04-02T15:00:00.000Z",
      contractorHiredAt: "2026-04-02T16:00:00.000Z",
      title: "Fence repair",
      referenceNumber: 1042,
      city: "Atlanta",
      customerLabel: "Christopher",
    });
    if (!job) throw new Error("expected a hired job card");
    render(
      <MemoryRouter>
        <HiredJobsSection jobs={[job]} />
      </MemoryRouter>,
    );
    expect(screen.getByRole("heading", { name: "Hired jobs" })).toBeInTheDocument();
    expect(screen.getByText("Confirmed")).toBeInTheDocument();
    expect(screen.getByText("PPP-1042")).toBeInTheDocument();
    expect(screen.getByText("Christopher · Atlanta")).toBeInTheDocument();
    expect(screen.getByText("Next: Start the job when you are ready.")).toBeInTheDocument();
    const open = screen.getByRole("link", { name: "Open job" });
    expect(open).toHaveAttribute("href", "/app/pro/jobs/book-1");
    expect(open.className).toContain("min-h-14");
    expect(open.className).toContain("w-full");
  });
});
