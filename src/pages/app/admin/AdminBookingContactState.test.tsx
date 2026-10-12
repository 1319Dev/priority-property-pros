import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ToastProvider } from "../../../components/ui/Toast";
import * as api from "../../../lib/marketplace/api";
import { adminContactAccessSummary, adminEffectiveContactAccess } from "../../../lib/marketplace/bookings";
import type { BookingContactAccess } from "../../../lib/marketplace/types";
import { AdminBookingsPage } from "../AdminPages";

vi.mock("../../../lib/marketplace/api", () => ({
  expireStalePendingBookings: vi.fn().mockResolvedValue(0),
  fetchBooking: vi.fn(),
  fetchProject: vi.fn(),
  fetchBookingContactAccess: vi.fn(),
  fetchConnectionContactAccess: vi.fn(),
  fetchBookingEvents: vi.fn(),
  findAdminBookingsByReference: vi.fn(),
  adminGrantBookingContactAccess: vi.fn(),
  adminRevokeBookingContactAccess: vi.fn(),
  confirmBookingForTesting: vi.fn(),
}));

const BOOKING = "00000000-0000-4000-8000-0000000000b1";
const PROJECT = "00000000-0000-4000-8000-0000000000a1";
const PRO = "00000000-0000-4000-8000-0000000000c1";

/** Same shape as PPP-1004 on 2026-10-11: a paid Connect row with booking_id null plus a booking-scoped admin override. */
const connectRow: BookingContactAccess = {
  id: "00000000-0000-4000-8000-0000000000d1",
  booking_id: null,
  connection_id: "00000000-0000-4000-8000-0000000000e1",
  project_id: PROJECT,
  contractor_profile_id: PRO,
  status: "UNLOCKED",
  granted_at: "2026-10-04T23:17:56Z",
  granted_by: null,
  grant_reason: "connection_fee_payment",
  grant_source: "CONNECTION_FEE_PAYMENT",
  revoked_at: null,
  created_at: "2026-10-04T23:17:56Z",
  updated_at: "2026-10-04T23:17:56Z",
};

const overrideRow: BookingContactAccess = {
  ...connectRow,
  id: "00000000-0000-4000-8000-0000000000d2",
  booking_id: BOOKING,
  connection_id: null,
  status: "ADMIN_OVERRIDE",
  grant_source: "ADMIN_OVERRIDE",
  granted_at: "2026-10-10T22:04:33Z",
  granted_by: "00000000-0000-4000-8000-0000000000f1",
  grant_reason: "They paid for this connection",
};

describe("adminEffectiveContactAccess", () => {
  it("treats a paid Connect row as unlocked even when booking_id is null", () => {
    const view = adminEffectiveContactAccess(null, [connectRow]);
    expect(view.unlocked).toBe(true);
    expect(view.viaConnect).toBe(connectRow);
    expect(view.viaOverride).toBeNull();
    expect(adminContactAccessSummary(view)).toMatch(/paid the \$4\.99 Connect/);
  });

  it("reports both routes for the PPP-1004 shape", () => {
    const view = adminEffectiveContactAccess(overrideRow, [connectRow]);
    expect(view.unlocked).toBe(true);
    expect(view.viaConnect).toBe(connectRow);
    expect(view.viaOverride).toBe(overrideRow);
  });

  it("ignores revoked rows and locked rows", () => {
    const view = adminEffectiveContactAccess(
      { ...overrideRow, status: "LOCKED", grant_source: "NONE" as BookingContactAccess["grant_source"] },
      [{ ...connectRow, revoked_at: "2026-10-05T00:00:00Z" }],
    );
    expect(view.unlocked).toBe(false);
    expect(adminContactAccessSummary(view)).toMatch(/^Project contact is locked/);
  });

  it("counts a Connect grant carried onto the booking row as Connect, not an override", () => {
    const carried = { ...connectRow, booking_id: BOOKING, connection_id: null };
    const view = adminEffectiveContactAccess(carried, []);
    expect(view.viaConnect).toBe(carried);
    expect(view.viaOverride).toBeNull();
  });
});

function setup(bookingRow: BookingContactAccess | null, connectRows: BookingContactAccess[]) {
  vi.mocked(api.fetchBooking).mockResolvedValue({
    id: BOOKING,
    status: "IN_PROGRESS",
    project_id: PROJECT,
    contractor_profile_id: PRO,
  } as Awaited<ReturnType<typeof api.fetchBooking>>);
  vi.mocked(api.fetchProject).mockResolvedValue({ title: "Fence repair", reference_number: 1004 } as Awaited<
    ReturnType<typeof api.fetchProject>
  >);
  vi.mocked(api.fetchBookingContactAccess).mockResolvedValue(bookingRow);
  vi.mocked(api.fetchConnectionContactAccess).mockResolvedValue(connectRows);
  vi.mocked(api.fetchBookingEvents).mockResolvedValue([]);
  render(
    <MemoryRouter>
      <ToastProvider>
        <AdminBookingsPage />
      </ToastProvider>
    </MemoryRouter>,
  );
  fireEvent.change(screen.getByLabelText("Booking id"), { target: { value: BOOKING } });
  fireEvent.click(screen.getByRole("button", { name: "Look up" }));
}

describe("Booking tools contact state", () => {
  beforeEach(() => vi.clearAllMocks());

  it("does not offer a grant before a booking is looked up", () => {
    render(
      <MemoryRouter>
        <ToastProvider>
          <AdminBookingsPage />
        </ToastProvider>
      </MemoryRouter>,
    );
    expect(screen.queryByRole("button", { name: "Grant contact access" })).not.toBeInTheDocument();
    expect(screen.queryByText(/Project contact is locked/)).not.toBeInTheDocument();
  });

  it("PPP-1004 shape: shows unlocked, no grant button, and explains the override revoke", async () => {
    setup(overrideRow, [connectRow]);
    await screen.findByText("Current status: IN PROGRESS");
    await waitFor(() => expect(api.fetchConnectionContactAccess).toHaveBeenCalledWith(PROJECT, PRO));
    expect(screen.queryByText(/Project contact is locked/)).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Grant contact access" })).not.toBeInTheDocument();
    expect(screen.getAllByText(/Contact is unlocked\. This contractor paid the \$4\.99 Connect/).length).toBeGreaterThan(0);
    expect(screen.getByRole("button", { name: "Revoke admin override" })).toBeInTheDocument();
    expect(screen.getByText(/does not remove access from the paid Connect/)).toBeInTheDocument();
  });

  it("paid Connect only: unlocked, no grant and no revoke", async () => {
    setup(null, [connectRow]);
    await screen.findByText("Current status: IN PROGRESS");
    await waitFor(() =>
      expect(screen.getAllByText(/no admin grant is needed/).length).toBeGreaterThan(0),
    );
    expect(screen.queryByRole("button", { name: "Grant contact access" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Revoke/ })).not.toBeInTheDocument();
  });

  it("nothing paid and no override: locked copy and the grant button", async () => {
    setup(null, []);
    await screen.findByText("Current status: IN PROGRESS");
    await waitFor(() =>
      expect(screen.getAllByText(/Project contact is locked/).length).toBeGreaterThan(0),
    );
    expect(screen.getByRole("button", { name: "Grant contact access" })).toBeInTheDocument();
  });
});
