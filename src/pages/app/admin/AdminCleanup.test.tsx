import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";
import { ToastProvider } from "../../../components/ui/Toast";
import { AuthContext, type AuthContextValue } from "../../../lib/auth/AuthContext";
import { AdminShell } from "../AdminShell";
import { AdminBookingsPage, AdminHomePage } from "../AdminPages";

vi.mock("../../../lib/admin/approvalsApi", () => ({
  countPendingContractorApprovals: vi.fn().mockResolvedValue(0),
}));

vi.mock("../../../lib/marketplace/api", () => ({
  expireStalePendingBookings: vi.fn().mockResolvedValue(0),
  fetchBooking: vi.fn(),
  fetchProject: vi.fn(),
  fetchBookingContactAccess: vi.fn(),
  fetchBookingEvents: vi.fn(),
  findAdminBookingsByReference: vi.fn(),
  adminGrantBookingContactAccess: vi.fn(),
  adminRevokeBookingContactAccess: vi.fn(),
  confirmBookingForTesting: vi.fn(),
}));

const auth = {
  configured: true,
  loading: false,
  user: { id: "admin-1" },
  session: null,
  profile: { first_name: "Ada", last_name: "Admin", email: "ada@example.com" },
  account_type: "ADMIN",
  account_status: "ACTIVE",
  signup_fee_status: null,
  signup_fee_enabled: false,
  signIn: vi.fn(),
  signUp: vi.fn(),
  signOut: vi.fn(),
  refreshProfile: vi.fn(),
  requestPasswordReset: vi.fn(),
  updatePassword: vi.fn(),
  resendVerification: vi.fn(),
} as unknown as AuthContextValue;

describe("admin cleanup", () => {
  it("drops the false payments sentence and the people and audit placeholders", () => {
    render(<AdminHomePage />);
    expect(screen.getByRole("heading", { name: "Overview" })).toBeInTheDocument();
    expect(screen.queryByText(/Payments are not live/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/People list not wired/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/Audit log viewer later/i)).not.toBeInTheDocument();
  });

  it("does not link to People or Audit", () => {
    render(
      <MemoryRouter>
        <AuthContext.Provider value={auth}>
          <AdminShell />
        </AuthContext.Provider>
      </MemoryRouter>,
    );
    expect(screen.queryByRole("link", { name: "People" })).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Audit" })).not.toBeInTheDocument();
    expect(screen.getAllByRole("link", { name: "Booking tools" }).length).toBeGreaterThan(0);
  });

  it("keeps the no-charge confirm button in a non-production build", () => {
    render(
      <MemoryRouter>
        <ToastProvider>
          <AdminBookingsPage />
        </ToastProvider>
      </MemoryRouter>,
    );
    expect(screen.getByRole("heading", { name: "Booking tools" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Confirm for testing (no charge)" })).toBeInTheDocument();
  });
});
