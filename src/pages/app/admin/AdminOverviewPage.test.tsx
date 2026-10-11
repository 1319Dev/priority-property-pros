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
const fetchPaymentsSummary = vi.fn();

vi.mock("../../../lib/admin/paymentsApi", async () => {
  const actual = await vi.importActual<typeof import("../../../lib/admin/paymentsApi")>("../../../lib/admin/paymentsApi");
  return {
    ...actual,
    fetchPaymentsSummary: (...args: unknown[]) => fetchPaymentsSummary(...args),
  };
});

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
    fetchAdminDashboardSummary.mockResolvedValue(summary);
    fetchAdminNeedsAttention.mockResolvedValue(attention);
    fetchAdminRecentActivity.mockResolvedValue(activity);
    fetchAdminDashboardTrends.mockResolvedValue(trends);
    fetchPaymentsSummary.mockRejectedValue(new Error("not set up"));
  });

  it("shows documented counts, integer revenue, and unavailable metrics", async () => {
    renderOverview();
    expect((await screen.findAllByText("$14.98")).length).toBeGreaterThan(0);
    expect(screen.queryByText("Not set up yet")).not.toBeInTheDocument();
    expect(screen.queryByText("Net revenue")).not.toBeInTheDocument();
    expect(screen.queryByText("Card declines")).not.toBeInTheDocument();
    expect(screen.queryByText(/Card declines:/)).not.toBeInTheDocument();
    expect(screen.queryByText("Support tickets")).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: "support@prioritypropertypros.com" })).toHaveAttribute(
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

  it("collapses consecutive identical activity and keeps numbers while a refresh is in flight", async () => {
    let release: (value: DashboardSummary) => void = () => undefined;
    fetchAdminRecentActivity.mockResolvedValue([
      { ...activity[0], label: "Account flag updated", subjectLabel: "Tina", jobReference: null, cursor: "a" },
      { ...activity[0], label: "Account flag updated", subjectLabel: "Tina", jobReference: null, cursor: "b" },
      { ...activity[0], cursor: "c" },
    ]);
    fetchAdminDashboardSummary.mockResolvedValueOnce(summary).mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          release = resolve;
        }),
    );
    const user = userEvent.setup();
    renderOverview();
    expect(await screen.findByText("Account flag updated · 2")).toBeInTheDocument();
    expect(screen.getAllByText("Account flag updated", { exact: false })).toHaveLength(1);
    expect(screen.getByText("Homeowner accounts, not counting deleted ones.")).toBeInTheDocument();
    expect(screen.getByText(/Support requests arrive by email at/)).toBeInTheDocument();
    expect(screen.queryByText(/gmail/i)).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Refresh" }));
    expect(screen.getAllByText("$14.98").length).toBeGreaterThan(0);
    release(summary);
    await waitFor(() => expect(fetchAdminDashboardSummary).toHaveBeenCalledTimes(2));
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

  it("fills the net revenue card from the payments summary and leaves declines unset", async () => {
    fetchPaymentsSummary.mockResolvedValue({
      grossCents: 2497,
      refundedCents: 0,
      netCents: 2497,
      failedCount: 1,
      needsRefundCount: 2,
      definition: "needs_refund flag is not a completed refund",
    });
    renderOverview();
    expect(await screen.findByRole("link", { name: /Net revenue/ })).toHaveAttribute("href", "/app/admin/payments");
    expect(screen.getByText("Succeeded live fees minus stored refunds")).toBeInTheDocument();
    expect(screen.getAllByText("$14.98").length).toBeGreaterThan(0);
    expect(screen.getByText("$24.97")).toBeInTheDocument();
    expect(screen.queryByText("Card declines")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /mark paid|refund/i })).not.toBeInTheDocument();
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

  it("shows plain sentences and never the database definitions, including the old support address", async () => {
    fetchAdminDashboardSummary.mockResolvedValue({
      ...summary,
      metrics: {
        ...summary.metrics,
        homeowners: metric(1, "available", "profiles where account_type is CUSTOMER and account_status is not DELETED"),
        revenue_lifetime_cents: metric(
          1498,
          "available",
          "sum of amount_cents from livemode signup_fee_charges and connection_checkout_sessions in PAID or CONSUMED",
        ),
        support_tickets: metric(
          null,
          "unavailable",
          "No support_tickets table. Support today is email to prioritypropertypros@gmail.com",
        ),
      },
    });
    const { container } = renderOverview();
    await screen.findAllByText("$14.98");
    expect(screen.getByText("Homeowner accounts, not counting deleted ones.")).toBeInTheDocument();
    expect(screen.getByText("All activation and Connect fees paid, in live mode.")).toBeInTheDocument();
    expect(container.textContent).not.toMatch(/account_type|amount_cents|livemode|signup_fee_charges|gmail/);
  });

  it("shows Net revenue once the database reports it", async () => {
    fetchAdminDashboardSummary.mockResolvedValue({
      ...summary,
      metrics: { ...summary.metrics, revenue_net_cents: metric(123456, "available", "net") },
    });
    renderOverview();
    expect(await screen.findByText("Net revenue")).toBeInTheDocument();
    expect(screen.getByText("$1,234.56")).toBeInTheDocument();
  });
});
