import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ADMIN_ACTIVITY_PAGE_SIZE } from "../../../lib/admin/dashboardApi";
import type { ActivityRow, AttentionList, DashboardSummary, DashboardTrends } from "../../../lib/admin/dashboardApi";
import { trendQuery } from "../../../lib/admin/money";
import { AdminHomePage } from "../AdminPages";

const fetchAdminDashboardSummary = vi.fn();
const fetchAdminNeedsAttention = vi.fn();
const fetchAdminRecentActivity = vi.fn();
const fetchAdminDashboardTrends = vi.fn();
const fetchUnhandledContactCount = vi.fn();

vi.mock("../../../lib/admin/contactMessagesApi", () => ({
  fetchUnhandledContactCount: (...args: unknown[]) => fetchUnhandledContactCount(...args),
}));

vi.mock("../../../lib/admin/dashboardApi", async () => {
  const actual = await vi.importActual<typeof import("../../../lib/admin/dashboardApi")>("../../../lib/admin/dashboardApi");
  return {
    ...actual,
    fetchAdminDashboardSummary: (...args: unknown[]) => fetchAdminDashboardSummary(...args),
    fetchAdminNeedsAttention: (...args: unknown[]) => fetchAdminNeedsAttention(...args),
    fetchAdminRecentActivity: (...args: unknown[]) => fetchAdminRecentActivity(...args),
    fetchAdminDashboardTrends: (...args: unknown[]) => fetchAdminDashboardTrends(...args),
  };
});

function metric(value: number | null, status: "available" | "unavailable", definition: string) {
  return { value, status, definition };
}

const summary: DashboardSummary = {
  generatedAt: "2026-10-10T22:31:00.000Z",
  includeTest: false,
  timezone: "America/Chicago",
  revenueNote: "Gross activation and Connect fees only, before Stripe fees.",
  metrics: {
    homeowners: metric(1, "available", "customers"),
    contractors: metric(2, "available", "contractors"),
    active_approved_contractors: metric(2, "available", "approved"),
    awaiting_approval: metric(0, "available", "pending applications"),
    identity_review_required: metric(0, "available", "identity"),
    projects_posted: metric(1, "available", "posted"),
    projects_open: metric(0, "available", "open"),
    awaiting_estimates: metric(0, "available", "waiting"),
    marked_hired: metric(1, "available", "hired"),
    completed: metric(0, "available", "completed"),
    revenue_month_cents: metric(1498, "available", "month gross cents"),
    revenue_lifetime_cents: metric(1498, "available", "lifetime gross cents"),
    revenue_net_cents: metric(null, "unavailable", "net is not stored"),
    checkouts_completed: metric(2, "available", "paid or consumed"),
    checkouts_expired: metric(0, "available", "abandoned checkout"),
    checkouts_open: metric(0, "available", "still open"),
    card_declines: metric(null, "unavailable", "declines are not recorded"),
    pending_photo_approvals: metric(0, "available", "photos"),
    platform_reviews_pending: metric(0, "available", "reviews"),
    content_reports_30d: metric(1, "available", "reports"),
    disputed_bookings: metric(0, "available", "disputes"),
    support_tickets: metric(null, "unavailable", "no support table"),
  },
};

const attention: AttentionList = {
  generatedAt: summary.generatedAt,
  includeTest: false,
  mfa: "missing",
  items: [
    {
      kind: "content_reports_30d",
      count: 1,
      severity: "medium",
      link: null,
      note: "Reports received in the last 30 days. There is no resolve status yet, and no admin screen for them",
    },
    {
      kind: "admin_mfa_missing",
      count: 1,
      severity: "medium",
      link: "/app/admin/security",
      note: "Two-factor is not enrolled on this admin account. Enforcement stays off until you turn it on",
    },
  ],
};

const activity: ActivityRow[] = [
  {
    occurredAt: "2026-10-10T15:00:00.000Z",
    kind: "project.posted",
    label: "Project posted",
    jobReference: "PPP-1004",
    subjectLabel: "Owen",
    ownerActivity: true,
    cursor: "2026-10-10 15:00:00.000000|project.posted|11111111-1111-1111-1111-111111111111",
  },
];

const trends: DashboardTrends = {
  granularity: "day",
  from: "2026-09-11",
  to: "2026-10-10",
  revenueNote: "Gross cents from livemode activation and Connect fees.",
  checkoutNote: "Expired is an abandoned Checkout. Card declines are not recorded.",
  cardDeclinesUnavailable: true,
  buckets: [
    {
      start: "2026-10-10",
      revenueCents: 1498,
      signupsCustomer: 0,
      signupsContractor: 0,
      homeownersCumulative: 1,
      contractorsCumulative: 2,
      projectsPosted: 1,
      hires: 1,
      completions: 0,
      checkoutsCompleted: 2,
      checkoutsExpired: 0,
    },
  ],
};

function renderOverview() {
  return render(
    <MemoryRouter>
      <AdminHomePage />
    </MemoryRouter>,
  );
}

describe("Admin overview", () => {
  beforeEach(() => {
    localStorage.clear();
    fetchAdminDashboardSummary.mockReset();
    fetchAdminNeedsAttention.mockReset();
    fetchAdminRecentActivity.mockReset();
    fetchAdminDashboardTrends.mockReset();
    fetchUnhandledContactCount.mockReset();
    fetchUnhandledContactCount.mockResolvedValue(0);
    fetchAdminDashboardSummary.mockResolvedValue(summary);
    fetchAdminNeedsAttention.mockResolvedValue(attention);
    fetchAdminRecentActivity.mockResolvedValue(activity);
    fetchAdminDashboardTrends.mockResolvedValue(trends);
  });

  it("shows documented counts, integer revenue, and unavailable metrics", async () => {
    renderOverview();
    expect((await screen.findAllByText("$14.98")).length).toBeGreaterThan(0);
    expect(screen.getAllByText("Not set up yet").length).toBeGreaterThanOrEqual(3);
    expect(screen.getByRole("link", { name: /Email support@prioritypropertypros.com/i })).toHaveAttribute(
      "href",
      "mailto:support@prioritypropertypros.com",
    );
    expect(screen.getByRole("link", { name: /Awaiting approval/i })).toHaveAttribute("href", "/app/admin/approvals");
    expect(screen.getByRole("link", { name: /Platform reviews/i })).toHaveAttribute("href", "/app/admin/reviews");
    expect(screen.getByRole("link", { name: /Two-factor is not enrolled/i })).toHaveAttribute("href", "/app/admin/security");
    expect(screen.getByText(/no admin screen for them/i).closest("a")).toBeNull();
    expect(screen.getByRole("link", { name: "PPP-1004" })).toHaveAttribute("href", "/app/admin/bookings?ref=PPP-1004");
    expect(screen.getByText("Owner")).toBeInTheDocument();
    expect(screen.getByRole("img", { name: "Gross revenue" })).toBeInTheDocument();
    expect(screen.getAllByRole("table").length).toBeGreaterThan(0);
    expect(screen.queryByText(/Payments are not live/i)).not.toBeInTheDocument();
    expect(screen.queryByText("$0.00")).not.toBeInTheDocument();
  });

  it("adds unhandled contact messages to needs attention without the dashboard RPC", async () => {
    fetchUnhandledContactCount.mockResolvedValue(4);
    renderOverview();
    const link = await screen.findByRole("link", { name: /Contact messages waiting to be handled/i });
    expect(link).toHaveAttribute("href", "/app/admin/contact");
    expect(link).toHaveTextContent("4");
  });

  it("shows an empty activity feed without inventing rows", async () => {
    fetchAdminRecentActivity.mockResolvedValue([]);
    fetchAdminNeedsAttention.mockResolvedValue({ ...attention, items: [] });
    renderOverview();
    expect(await screen.findByText("No activity yet.")).toBeInTheDocument();
    expect(screen.getByText("Nothing needs a decision right now.")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Load more" })).not.toBeInTheDocument();
  });

  it("shows a dash and a friendly error instead of a fake zero", async () => {
    const raw = 'relation "secret" does not exist';
    fetchAdminDashboardSummary.mockRejectedValue(new Error(raw));
    fetchAdminNeedsAttention.mockRejectedValue(new Error(raw));
    fetchAdminRecentActivity.mockRejectedValue(new Error(raw));
    fetchAdminDashboardTrends.mockRejectedValue(new Error(raw));
    renderOverview();
    expect(await screen.findByRole("alert")).toHaveTextContent("Could not load the overview.");
    expect(screen.queryByText(raw)).not.toBeInTheDocument();
    expect(screen.queryByText("$0.00")).not.toBeInTheDocument();
    expect(screen.queryByText("$14.98")).not.toBeInTheDocument();
    expect(screen.getAllByText("—").length).toBeGreaterThan(0);
  });

  it("reloads with test accounts included when the switch is on", async () => {
    const user = userEvent.setup();
    renderOverview();
    await screen.findAllByText("$14.98");
    await user.click(screen.getByRole("checkbox", { name: "Include test accounts" }));
    await waitFor(() => expect(fetchAdminDashboardSummary).toHaveBeenCalledWith(true));
    expect(localStorage.getItem("ppp-admin-include-test")).toBe("1");
  });

  it("loads the next activity page from the last cursor", async () => {
    const page = Array.from({ length: ADMIN_ACTIVITY_PAGE_SIZE }, (_, index) => ({
      ...activity[0],
      cursor: `2026-10-10 15:00:00.00000${index}|project.posted|11111111-1111-1111-1111-11111111111${index}`,
      label: `Project posted ${index}`,
    }));
    fetchAdminRecentActivity.mockResolvedValueOnce(page).mockResolvedValueOnce([]);
    const user = userEvent.setup();
    renderOverview();
    await user.click(await screen.findByRole("button", { name: "Load more" }));
    await waitFor(() =>
      expect(fetchAdminRecentActivity).toHaveBeenLastCalledWith({
        limit: ADMIN_ACTIVITY_PAGE_SIZE,
        cursor: page[page.length - 1]?.cursor,
        includeTest: false,
      }),
    );
  });

  it("requests the selected trend range", async () => {
    const user = userEvent.setup();
    renderOverview();
    await screen.findAllByText("$14.98");
    await user.click(screen.getByRole("button", { name: "7 days" }));
    await waitFor(() => {
      const query = trendQuery("7d");
      expect(fetchAdminDashboardTrends).toHaveBeenCalledWith({ ...query, includeTest: false });
    });
  });
});
