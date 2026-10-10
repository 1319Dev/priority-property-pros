import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { AuthContext, type AuthContextValue } from "../../lib/auth/AuthContext";
import { notifyApprovalsChanged } from "../../lib/admin/approvals";
import { AdminShell } from "../../pages/app/AdminShell";
import * as approvalsApi from "../../lib/admin/approvalsApi";
import { findAdminBookingsByReference } from "../../lib/marketplace/api";

vi.mock("../../lib/admin/approvalsApi", () => ({
  countPendingContractorApprovals: vi.fn(async () => 2),
}));

vi.mock("../../lib/marketplace/api", () => ({
  findAdminBookingsByReference: vi.fn(),
  expireStalePendingBookings: vi.fn(async () => undefined),
  fetchContractorProfileByUser: vi.fn(),
  fetchMyBookings: vi.fn(async () => []),
}));

vi.mock("../../lib/notifications/api", () => ({
  listInAppNotifications: vi.fn(async () => [
    {
      id: "n1",
      category: "messages",
      kind: "message.received",
      title: "New message",
      body: "A homeowner wrote in.",
      createdAt: "2026-10-10T12:00:00.000Z",
      readAt: null,
      path: "/app/admin",
    },
  ]),
  listNotificationPreferences: vi.fn(async () => []),
  markNotificationRead: vi.fn(async () => undefined),
  markAllNotificationsRead: vi.fn(async () => undefined),
}));

const auth: AuthContextValue = {
  configured: true,
  loading: false,
  user: { id: "admin-1", email: "ada@example.com" } as AuthContextValue["user"],
  session: null,
  profile: {
    id: "admin-1",
    email: "ada@example.com",
    first_name: "Ada",
    last_name: "Admin",
    phone: null,
    avatar_url: null,
    account_type: "ADMIN",
    account_status: "ACTIVE",
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-01T00:00:00Z",
  },
  account_type: "ADMIN",
  account_status: "ACTIVE",
  signup_fee_status: "NOT_REQUIRED",
  signup_fee_enabled: false,
  signIn: async () => ({ error: null }),
  signUp: async () => ({ error: null, needsEmailConfirm: true }),
  signOut: async () => undefined,
  refreshProfile: async () => undefined,
  requestPasswordReset: async () => ({ error: null }),
  updatePassword: async () => ({ error: null }),
  resendVerification: async () => ({ error: null }),
};

function renderAdmin(entry: string) {
  return render(
    <AuthContext.Provider value={auth}>
      <MemoryRouter initialEntries={[entry]}>
        <Routes>
          <Route path="/app/admin" element={<AdminShell />}>
            <Route index element={<h1>Overview page</h1>} />
            <Route path="approvals" element={<h1>Approvals page</h1>} />
            <Route path="approvals/:contractorProfileId" element={<h1>Application page</h1>} />
            <Route path="reviews" element={<h1>Reviews page</h1>} />
            <Route path="bookings" element={<h1>Bookings page</h1>} />
            <Route path="security" element={<h1>Two-factor page</h1>} />
            <Route path="account" element={<h1>Account page</h1>} />
          </Route>
        </Routes>
      </MemoryRouter>
    </AuthContext.Provider>,
  );
}

describe("admin layout", () => {
  beforeEach(() => {
    vi.mocked(approvalsApi.countPendingContractorApprovals).mockResolvedValue(2);
    vi.mocked(findAdminBookingsByReference).mockReset();
  });

  it("shows working sections, the pending badge, and no placeholder destinations", async () => {
    renderAdmin("/app/admin/reviews");
    expect(await screen.findAllByLabelText("2 pending")).not.toHaveLength(0);
    expect(screen.getAllByRole("link", { name: /Approvals/ }).length).toBeGreaterThan(0);
    expect(screen.getByRole("heading", { name: "Reviews page" })).toBeInTheDocument();
    expect(screen.getAllByRole("link", { name: "Reviews" }).some((link) => link.getAttribute("aria-current") === "page")).toBe(
      true,
    );
    expect(screen.getByRole("navigation", { name: "Breadcrumb" })).toHaveTextContent("Overview");
    expect(screen.getByRole("navigation", { name: "Breadcrumb" })).toHaveTextContent("Reviews");
    expect(screen.queryByRole("link", { name: "People" })).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: /^Audit/ })).not.toBeInTheDocument();
    expect(screen.queryByRole("navigation", { name: "Dashboard" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: /^Notifications/ })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Account menu" })).toBeInTheDocument();
  });

  it("clears the Approvals badge when the pending count drops", async () => {
    vi.mocked(approvalsApi.countPendingContractorApprovals).mockResolvedValue(1);
    renderAdmin("/app/admin");
    expect(await screen.findAllByLabelText("1 pending")).not.toHaveLength(0);
    vi.mocked(approvalsApi.countPendingContractorApprovals).mockResolvedValue(0);
    notifyApprovalsChanged();
    await waitFor(() => {
      expect(screen.queryAllByLabelText("1 pending")).toHaveLength(0);
    });
  });

  it("opens the phone menu and returns focus to the menu button on Escape", async () => {
    const user = userEvent.setup();
    renderAdmin("/app/admin");
    const menu = screen.getByRole("button", { name: "Open admin menu" });
    await user.click(menu);
    const dialog = screen.getByRole("dialog", { name: "Admin menu" });
    expect(dialog).toBeInTheDocument();
    await user.keyboard("{Escape}");
    expect(screen.queryByRole("dialog", { name: "Admin menu" })).not.toBeInTheDocument();
    expect(menu).toHaveFocus();
  });

  it("jumps to a section from search with the keyboard", async () => {
    const user = userEvent.setup();
    renderAdmin("/app/admin");
    const [input] = screen.getAllByRole("combobox", { name: "Search jobs and admin sections" });
    await user.click(input);
    await user.type(input, "approvals");
    expect(screen.getAllByRole("option", { name: "Approvals" }).length).toBeGreaterThan(0);
    await user.keyboard("{Enter}");
    expect(screen.getByRole("heading", { name: "Approvals page" })).toBeInTheDocument();
  });

  it("looks up a PPP job number and opens that booking record", async () => {
    vi.mocked(findAdminBookingsByReference).mockResolvedValue({
      projectId: "proj-1",
      title: "Fence repair",
      referenceNumber: 1004,
      bookings: [{ id: "book-1", status: "IN_PROGRESS" }],
    });
    const user = userEvent.setup();
    renderAdmin("/app/admin");
    const [input] = screen.getAllByRole("combobox", { name: "Search jobs and admin sections" });
    await user.click(input);
    await user.type(input, "PPP-1004");
    await user.keyboard("{Enter}");
    await waitFor(() => {
      expect(findAdminBookingsByReference).toHaveBeenCalledWith("PPP-1004");
    });
    expect(await screen.findByRole("heading", { name: "Bookings page" })).toBeInTheDocument();
  });

  it("shows an application breadcrumb on an approval detail path", async () => {
    renderAdmin("/app/admin/approvals/cp-1");
    expect(await screen.findAllByLabelText("2 pending")).not.toHaveLength(0);
    const crumbs = screen.getByRole("navigation", { name: "Breadcrumb" });
    expect(crumbs).toHaveTextContent("Overview");
    expect(crumbs).toHaveTextContent("Approvals");
    expect(crumbs).toHaveTextContent("Application");
    expect(screen.getByRole("heading", { name: "Application page" })).toBeInTheDocument();
  });
});
