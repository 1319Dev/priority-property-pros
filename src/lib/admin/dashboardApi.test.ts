import { beforeEach, describe, expect, it, vi } from "vitest";
import { getSupabaseClient } from "../supabase/client";
import {
  fetchAdminDashboardSummary,
  fetchAdminRecentActivity,
  parseActivity,
  parseDashboardSummary,
} from "./dashboardApi";

vi.mock("../supabase/client", () => ({
  getSupabaseClient: vi.fn(),
}));

const summaryPayload = {
  generated_at: "2026-10-10T22:31:00.000Z",
  include_test: false,
  timezone: "America/Chicago",
  revenue_note: "Gross only",
  metrics: {
    homeowners: { value: 1, status: "available", definition: "customers" },
    revenue_lifetime_cents: { value: "1498.9", status: "available", definition: "gross cents" },
    support_tickets: { value: 0, status: "unavailable", definition: "no table" },
    mystery: { value: "nope", status: "available", definition: "unreadable" },
  },
};

describe("dashboard API", () => {
  beforeEach(() => {
    vi.mocked(getSupabaseClient).mockReset();
  });

  it("reads integer cents and keeps unavailable metrics null", () => {
    const summary = parseDashboardSummary(summaryPayload);
    expect(summary.metrics.revenue_lifetime_cents).toEqual({
      value: 1498,
      status: "available",
      definition: "gross cents",
    });
    expect(summary.metrics.support_tickets).toEqual({
      value: null,
      status: "unavailable",
      definition: "no table",
    });
    expect(summary.metrics.mystery.value).toBeNull();
  });

  it("drops contact fields from activity rows", () => {
    const rows = parseActivity([
      {
        occurred_at: "2026-10-10T15:00:00.000Z",
        kind: "project.posted",
        label: "Project posted",
        job_reference: "PPP-1004",
        subject_label: "Owen",
        owner_activity: true,
        cursor: "2026-10-10 15:00:00.000000|project.posted|11111111-1111-1111-1111-111111111111",
        email: "secret@example.com",
        phone: "404-555-0100",
      },
    ]);
    expect(rows).toHaveLength(1);
    expect(rows[0]).not.toHaveProperty("email");
    expect(rows[0]).not.toHaveProperty("phone");
    expect(JSON.stringify(rows[0])).not.toContain("secret@example.com");
    expect(rows[0]?.jobReference).toBe("PPP-1004");
  });

  it("asks the summary RPC for the test-account switch and hides raw errors", async () => {
    const rpc = vi.fn().mockResolvedValue({
      data: null,
      error: { code: "42501", message: "permission denied for table signup_fee_charges" },
    });
    vi.mocked(getSupabaseClient).mockReturnValue({ rpc } as never);
    await expect(fetchAdminDashboardSummary(true)).rejects.toThrow("You need an admin sign-in to do that.");
    expect(rpc).toHaveBeenCalledWith("admin_dashboard_summary", { p_include_test: true });
  });

  it("passes the activity cursor through", async () => {
    const rpc = vi.fn().mockResolvedValue({ data: summaryPayload, error: null });
    vi.mocked(getSupabaseClient).mockReturnValue({ rpc } as never);
    await fetchAdminDashboardSummary(false);
    rpc.mockResolvedValue({
      data: [],
      error: null,
    });
    await fetchAdminRecentActivity({ limit: 25, cursor: "cursor-1", includeTest: false });
    expect(rpc).toHaveBeenLastCalledWith("admin_recent_activity", {
      p_limit: 25,
      p_cursor: "cursor-1",
      p_include_test: false,
    });
  });

  it("refuses to run without a configured client", async () => {
    vi.mocked(getSupabaseClient).mockReturnValue(null);
    await expect(fetchAdminDashboardSummary(false)).rejects.toThrow("Supabase is not configured yet.");
  });
});
