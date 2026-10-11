import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const migrationPath = path.join(repoRoot, "supabase/migrations/20261015000003_change_order_validation.sql");
const rollbackPath = path.join(repoRoot, "supabase/rollbacks/20261015000003_change_order_validation_rollback.sql");

function functionBody(sql: string, name: string): string {
  const marker = `CREATE OR REPLACE FUNCTION public.${name}`;
  const start = sql.lastIndexOf(marker);
  expect(start).toBeGreaterThan(-1);
  const rest = sql.slice(start);
  const end = rest.indexOf("CREATE OR REPLACE FUNCTION public.", marker.length);
  return end === -1 ? rest : rest.slice(0, end);
}

describe("change order validation SQL", () => {
  const migration = readFileSync(migrationPath, "utf8");
  const rollback = readFileSync(rollbackPath, "utf8");
  const propose = functionBody(migration, "propose_change_order");

  it("rejects zero, over-cap, and below-total deltas without changing fee math", () => {
    expect(propose).toMatch(/change order amount must not be zero/);
    expect(propose).toMatch(/change order amount is outside the allowed range/);
    expect(propose).toMatch(/a decrease cannot exceed the current job total/);
    expect(propose).toMatch(/change_order_max_abs_cents/);
    expect(propose).toMatch(/10000000/);
    expect(propose).toMatch(/coalesce\(b\.billable_amount_cents, b\.amount_cents, 0\)::bigint/);
    expect(propose).toMatch(/\(v_total \+ p_amount_delta_cents::bigint\) < 0/);
    expect(propose).toMatch(/::public\.change_order_status/);
    expect(propose).not.toMatch(/recompute_booking_money/);
    expect(propose).not.toMatch(/fee_cents\s*=/);
    expect(migration).not.toMatch(/CREATE OR REPLACE FUNCTION public\.respond_change_order/);
    expect(migration).not.toMatch(/CREATE OR REPLACE FUNCTION public\.recompute_booking_money/);
    expect(migration).toMatch(/CHECK \(amount_delta_cents <> 0\) NOT VALID/);
    expect(migration).toMatch(/CHECK \(char_length\(description\) <= 1000\) NOT VALID/);
    expect(migration).not.toMatch(/VALIDATE CONSTRAINT/);
    expect(migration).not.toMatch(/UPDATE public\.change_orders/);
  });

  it("rolls back to the unbounded propose body and drops the checks", () => {
    const restored = functionBody(rollback, "propose_change_order");
    expect(restored).not.toMatch(/change order amount must not be zero/);
    expect(restored).toMatch(/::public\.change_order_status/);
    expect(rollback).toMatch(/DROP CONSTRAINT IF EXISTS change_orders_amount_nonzero/);
    expect(rollback).toMatch(/DROP CONSTRAINT IF EXISTS change_orders_description_max/);
    expect(rollback).toMatch(/DELETE FROM public\.platform_settings WHERE key = 'change_order_max_abs_cents'/);
    expect(rollback).not.toMatch(/CREATE OR REPLACE FUNCTION public\.respond_change_order/);
  });
});

describe("hired-job change order prompt", () => {
  const proPage = readFileSync(path.join(repoRoot, "src/pages/app/pro/ProBookingPages.tsx"), "utf8");
  const hiredPanel = readFileSync(path.join(repoRoot, "src/components/marketplace/HiredJobsPanel.tsx"), "utf8");

  it("counts the contractor's turn, not every PROPOSED row", () => {
    expect(proPage).toMatch(/countChangeOrdersForParty\("contractor", orders\)/);
    expect(hiredPanel).toMatch(/countChangeOrdersForParty\("contractor", orders\)/);
    expect(proPage).not.toMatch(/order\.status === "PROPOSED"/);
    expect(hiredPanel).not.toMatch(/order\.status === "PROPOSED"/);
  });
});
