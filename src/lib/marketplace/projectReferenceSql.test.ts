import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const migrationName = "20261013000001_project_reference_numbers.sql";

function sql(): string {
  return readFileSync(path.join(repoRoot, "supabase/migrations", migrationName), "utf8");
}

describe("project reference number migration", () => {
  const text = sql();

  it("backfills a not-null unique sequence starting at 1001 in created_at order", () => {
    expect(migrationName > "20261012000002").toBe(true);
    expect(text).toMatch(/CREATE SEQUENCE IF NOT EXISTS public\.project_reference_seq/);
    expect(text).toMatch(/START WITH 1001/);
    expect(text).toMatch(/ADD COLUMN IF NOT EXISTS reference_number bigint/);
    expect(text).toMatch(/ORDER BY created_at ASC, id ASC/);
    expect(text).toMatch(/1000 \+ row_number\(\)/);
    expect(text).toMatch(/ALTER COLUMN reference_number SET DEFAULT nextval\('public\.project_reference_seq'\)/);
    expect(text).toMatch(/ALTER COLUMN reference_number SET NOT NULL/);
    expect(text).toMatch(/ADD CONSTRAINT projects_reference_number_key UNIQUE \(reference_number\)/);
    expect(text).toMatch(/setval/);
  });

  it("blocks signed-in clients from choosing or changing the number", () => {
    expect(text).toMatch(/project reference numbers are permanent and cannot be changed/);
    expect(text).toMatch(/BEFORE INSERT OR UPDATE OF reference_number ON public\.projects/);
    expect(text).toMatch(/auth\.uid\(\) IS NOT NULL/);
    expect(text).toMatch(/REVOKE ALL ON FUNCTION public\.protect_project_reference_number\(\) FROM PUBLIC, anon, authenticated/);
  });

  it("exposes the number on project-shaped RPCs without touching approval or payments", () => {
    expect(text).toMatch(/'project_reference_number', rows\.project_reference_number/);
    expect(text).toMatch(/'project_reference_number', p\.reference_number/);
    expect(text).toMatch(/SETOF projects via SELECT \*/);
    expect(text).not.toMatch(/admin_approve_contractor/);
    expect(text).not.toMatch(/admin_reject_contractor/);
    expect(text).not.toMatch(/admin_request_contractor_info/);
    expect(text).not.toMatch(/stripe/i);
    expect(text).not.toMatch(/payments_live/);
    expect(text).not.toMatch(/fee_cents/);
  });
});
