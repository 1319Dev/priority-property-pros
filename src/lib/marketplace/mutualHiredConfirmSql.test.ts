import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");

function allSql(): string {
  const dir = path.join(repoRoot, "supabase/migrations");
  return readdirSync(dir)
    .filter((name) => name.endsWith(".sql"))
    .sort()
    .map((name) => readFileSync(path.join(dir, name), "utf8"))
    .join("\n\n");
}

function functionBody(sql: string, name: string): string {
  const marker = `CREATE OR REPLACE FUNCTION public.${name}`;
  const start = sql.lastIndexOf(marker);
  expect(start).toBeGreaterThan(-1);
  const rest = sql.slice(start);
  const end = rest.indexOf("CREATE OR REPLACE FUNCTION public.", marker.length);
  return end === -1 ? rest : rest.slice(0, end);
}

describe("mutual hired confirms the booking without a fee", () => {
  const sql = allSql();
  const confirm = functionBody(sql, "confirm_booking_hired");
  const start = functionBody(sql, "start_booking");
  const complete = functionBody(sql, "complete_booking");
  const migration = readFileSync(
    path.join(repoRoot, "supabase/migrations/20261011000002_mutual_hired_confirms_booking.sql"),
    "utf8",
  );

  it("moves a mutually hired pending booking to CONFIRMED and opens the relationship", () => {
    expect(confirm).toMatch(/SET status = 'CONFIRMED'/);
    expect(confirm).toMatch(/PERFORM public\.ensure_relationship_on_confirm\(b\.id\)/);
    expect(confirm).not.toMatch(/lock_booking_fee/);
    expect(confirm).toMatch(/'payments_live', false/);
    expect(confirm).toMatch(/'charges_live', false/);
    expect(migration).toMatch(/customer_hired_at IS NOT NULL/);
    expect(migration).toMatch(/contractor_hired_at IS NOT NULL/);
    expect(migration).toMatch(/status IN \('PENDING', 'AWAITING_PAYMENT'\)/);
  });

  it("lets the customer start and complete without locking a fee", () => {
    expect(start).toMatch(/b\.customer_id IS DISTINCT FROM auth\.uid\(\)/);
    expect(start).toMatch(/b\.status <> 'CONFIRMED'/);
    expect(start).not.toMatch(/lock_booking_fee/);
    expect(complete).toMatch(/b\.status <> 'IN_PROGRESS'/);
    expect(complete).toMatch(/ensure_relationship_on_confirm/);
    expect(complete).not.toMatch(/lock_booking_fee/);
    expect(migration).not.toMatch(/payments_live',\s*1/);
    expect(migration).not.toMatch(/signup_fee_enabled/);
    expect(migration).not.toMatch(/connection_fee_checkout_enabled/);
  });
});
