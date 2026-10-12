import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { overlayNetRevenue, parsePaymentList, parsePaymentsSummary } from "./paymentsApi";
import type { DashboardSummary } from "./dashboardApi";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const migration = readFileSync(path.join(root, "supabase/migrations/20261019300004_admin_payments_dashboard.sql"), "utf8");

const summary: DashboardSummary = {
  generatedAt: null,
  includeTest: false,
  timezone: "America/Chicago",
  revenueNote: "gross",
  metrics: {
    revenue_net_cents: { value: null, status: "unavailable", definition: "not stored" },
    revenue_lifetime_cents: { value: 1498, status: "available", definition: "gross" },
  },
};

describe("payments dashboard SQL", () => {
  it("is admin-only, allowlisted, and has no write path", () => {
    const list = migration.slice(migration.indexOf("FUNCTION public.admin_list_payments"), migration.indexOf("FUNCTION public.admin_payments_summary"));
    expect(list).toContain("PERFORM public.admin_require()");
    expect(list).toContain("'refunded_cents'");
    expect(list).not.toMatch(/phone|street|stripe_|fee_cents/);
    expect(migration).toContain("PERFORM public.admin_require()");
    expect(migration).toContain("REVOKE ALL ON FUNCTION public.admin_list_payments(text, text, text, boolean, boolean, integer, integer) FROM PUBLIC, anon");
    expect(migration).toContain("REVOKE ALL ON FUNCTION public.admin_payments_summary(boolean) FROM PUBLIC, anon");
    expect(migration).not.toMatch(/\bUPDATE\b|\bINSERT\b|\bDELETE\b/);
    expect(migration).not.toMatch(/mark_paid|issue_refund/i);
  });

  it("maps the allowlist and overlays net revenue without touching gross", () => {
    const parsed = parsePaymentList({
      total: 1,
      rows: [
        {
          payment_id: "pay-1",
          kind: "activation",
          amount_cents: 999,
          status: "FAILED",
          livemode: true,
          needs_refund: false,
          refunded_cents: 0,
          party_name: "Owen Home",
        },
      ],
    });
    expect(parsed.rows[0]?.status).toBe("FAILED");
    expect(parsed.rows[0]?.refundedCents).toBe(0);
    const money = parsePaymentsSummary({
      gross_cents: 2497,
      refunded_cents: 0,
      net_cents: 2497,
      failed_count: 1,
      needs_refund_count: 2,
      definition: "needs_refund flag is not a completed refund",
    });
    const next = overlayNetRevenue(summary, money);
    expect(next?.metrics.revenue_net_cents).toEqual({
      value: 2497,
      status: "available",
      definition: "needs_refund flag is not a completed refund",
    });
    expect(next?.metrics.revenue_lifetime_cents.value).toBe(1498);
  });
});
