import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { CustomerBookingsPage } from "./BookingPages";

vi.mock("../../../lib/auth/useAuth", () => ({
  useAuth: () => ({ user: { id: "cust-1" }, profile: { id: "cust-1" }, loading: false }),
}));

vi.mock("../../../lib/marketplace/api", async () => {
  const actual = await vi.importActual<typeof import("../../../lib/marketplace/api")>("../../../lib/marketplace/api");
  return {
    ...actual,
    expireStalePendingBookings: vi.fn(),
    fetchMyBookings: vi.fn(),
    fetchCustomerProjects: vi.fn(),
    fetchContractorNameForProject: vi.fn(),
    fetchPublicContractor: vi.fn(),
  };
});

import {
  expireStalePendingBookings,
  fetchContractorNameForProject,
  fetchCustomerProjects,
  fetchMyBookings,
  fetchPublicContractor,
} from "../../../lib/marketplace/api";

const booking = {
  id: "8ef8f18e-0000-4000-8000-000000000000",
  project_id: "p-1004",
  contractor_profile_id: "pro-1",
  customer_id: "cust-1",
  status: "IN_PROGRESS",
  customer_hired_at: "2026-10-05T00:00:00Z",
  contractor_hired_at: "2026-10-05T00:01:00Z",
  amount_cents: 50000,
  billable_amount_cents: 50000,
};

function renderPage() {
  return render(
    <MemoryRouter>
      <CustomerBookingsPage />
    </MemoryRouter>,
  );
}

describe("homeowner Bookings page", () => {
  beforeEach(() => {
    vi.mocked(fetchCustomerProjects).mockResolvedValue([{ id: "p-1004", title: "Fence repair", reference_number: 1004 }] as never);
    vi.mocked(fetchContractorNameForProject).mockResolvedValue("Plymate Pros" as never);
    vi.mocked(fetchPublicContractor).mockResolvedValue(null as never);
  });

  it("shows a Hired booking even when the stale-request cleanup call fails (PPP-1004 regression)", async () => {
    vi.mocked(expireStalePendingBookings).mockRejectedValue(new Error("Could not refresh expired bookings."));
    vi.mocked(fetchMyBookings).mockResolvedValue([booking] as never);
    renderPage();
    expect(await screen.findByText("Fence repair")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "View booking" })).toHaveAttribute("href", `/app/customer/bookings/${booking.id}`);
    expect(screen.queryByText("No bookings yet")).not.toBeInTheDocument();
  });

  it("shows an error with retry, not 'No bookings yet', when bookings cannot load", async () => {
    vi.mocked(expireStalePendingBookings).mockResolvedValue(0);
    vi.mocked(fetchMyBookings).mockRejectedValue(new Error("Could not load bookings."));
    renderPage();
    expect(await screen.findByRole("alert")).toHaveTextContent(/couldn't load your bookings/i);
    expect(screen.getByRole("button", { name: "Try again" })).toBeInTheDocument();
    expect(screen.queryByText("No bookings yet")).not.toBeInTheDocument();
  });

  it("does not flash 'No bookings yet' while loading", () => {
    vi.mocked(expireStalePendingBookings).mockReturnValue(new Promise(() => undefined));
    vi.mocked(fetchMyBookings).mockResolvedValue([booking] as never);
    renderPage();
    expect(screen.queryByText("No bookings yet")).not.toBeInTheDocument();
  });

  it("still shows the empty state when there really are no bookings", async () => {
    vi.mocked(expireStalePendingBookings).mockResolvedValue(0);
    vi.mocked(fetchMyBookings).mockResolvedValue([] as never);
    renderPage();
    expect(await screen.findByText("No bookings yet")).toBeInTheDocument();
  });
});
