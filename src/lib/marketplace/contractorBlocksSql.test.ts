import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const migrationName = "20261016000001_customer_contractor_blocks.sql";
const rollbackName = "20261016000001_customer_contractor_blocks_rollback.sql";
const previousEligibility = "20261012000003_unpaid_contractor_gates.sql";
const previousHireAgain = "20261013000004_public_pro_labels.sql";

function readMigration(name: string): string {
  return readFileSync(path.join(repoRoot, "supabase/migrations", name), "utf8");
}

function readRollback(name: string): string {
  return readFileSync(path.join(repoRoot, "supabase/rollbacks", name), "utf8");
}

function extractFunction(sql: string, name: string): string {
  const marker = `CREATE OR REPLACE FUNCTION public.${name}`;
  const start = sql.indexOf(marker);
  expect(start, name).toBeGreaterThan(-1);
  const rest = sql.slice(start);
  const end = rest.indexOf("\n$$;");
  expect(end, name).toBeGreaterThan(-1);
  return rest.slice(0, end + "\n$$;".length);
}

const blockStanza = `  IF EXISTS (
    SELECT 1
    FROM public.customer_contractor_blocks b
    WHERE b.customer_profile_id = proj.customer_id
      AND b.contractor_profile_id = cp.id
  ) THEN
    RETURN false;
  END IF;

`;

const hireAgainFilter = `      AND r.last_completed_booking_id IS NOT NULL
      AND NOT EXISTS (
        SELECT 1
        FROM public.customer_contractor_blocks b
        WHERE b.customer_profile_id = r.customer_id
          AND b.contractor_profile_id = r.contractor_profile_id
      )
`;

describe("customer contractor block SQL", () => {
  const migration = readMigration(migrationName);
  const rollback = readRollback(rollbackName);
  const names = readdirSync(path.join(repoRoot, "supabase/migrations"))
    .filter((name) => name.endsWith(".sql"))
    .sort();

  it("uses a version after 20261015000004 and does not reuse public_pro_labels", () => {
    expect(names).toContain(migrationName);
    expect(names).toContain("20261018000001_legal_agreement_acceptance.sql");
    expect(migrationName > "20261015000004").toBe(true);
    expect(names.includes("20261013000004_public_pro_labels.sql")).toBe(true);
    expect(names.filter((name) => name.startsWith("20261016000001"))).toEqual([migrationName]);
    expect(names.filter((name) => name.includes("customer_contractor_blocks"))).toEqual([migrationName]);
  });

  it("adds only the block check to eligibility and hire again", () => {
    const previous = extractFunction(readMigration(previousEligibility), "contractor_eligible_for_project");
    const next = extractFunction(migration, "contractor_eligible_for_project");
    expect(next).toContain(blockStanza);
    expect(next.replace(blockStanza, "")).toBe(previous);
    expect(next).toContain("signup_fee_is_satisfied(acct.id)");
    expect(next).toContain("location_matches(proj.zip_code");
    expect(next).toContain("approval_status IS DISTINCT FROM 'APPROVED'");
    expect(next).toContain("accepting_work IS NOT TRUE");

    const previousHire = extractFunction(readMigration(previousHireAgain), "hire_again_contractors");
    const nextHire = extractFunction(migration, "hire_again_contractors");
    expect(nextHire).toContain(hireAgainFilter);
    expect(nextHire.replace(hireAgainFilter, "      AND r.last_completed_booking_id IS NOT NULL\n")).toBe(previousHire);
  });

  it("rolls eligibility and hire again back to the previous definitions", () => {
    expect(extractFunction(rollback, "contractor_eligible_for_project")).toBe(
      extractFunction(readMigration(previousEligibility), "contractor_eligible_for_project"),
    );
    expect(extractFunction(rollback, "hire_again_contractors")).toBe(
      extractFunction(readMigration(previousHireAgain), "hire_again_contractors"),
    );
    expect(rollback).toContain("DROP TABLE IF EXISTS public.customer_contractor_blocks");
    expect(rollback).toContain("DROP TYPE IF EXISTS public.customer_contractor_block_reason");
    expect(rollback).toContain("DROP TRIGGER IF EXISTS booking_reviews_low_rating_block");
    expect(rollback).not.toContain("customer_contractor_blocks b");
  });

  it("does not touch payments, contact unlock, notifications, or existing reviews", () => {
    expect(migration).not.toMatch(/UPDATE public\.project_connections/i);
    expect(migration).not.toMatch(/INSERT INTO public\.project_connections/i);
    expect(migration).not.toMatch(/booking_contact_access/);
    expect(migration).not.toMatch(/stripe/i);
    expect(migration).not.toMatch(/enqueue_notification/);
    expect(migration).not.toMatch(/notify_safely/);
    expect(migration).not.toMatch(/INSERT INTO public\.customer_contractor_blocks[\s\S]{0,200}SELECT/i);
    expect(migration).toMatch(/WHEN \(NEW\.reviewer_role = 'CUSTOMER' AND NEW\.rating <= 3\)/);
    expect(migration).toMatch(/ON CONFLICT \(customer_profile_id, contractor_profile_id\) DO NOTHING/);
    expect(migration).toMatch(/GRANT SELECT, DELETE ON TABLE public\.customer_contractor_blocks TO authenticated/);
    expect(migration).not.toMatch(/GRANT INSERT ON TABLE public\.customer_contractor_blocks/);
    expect(migration).not.toMatch(/GRANT UPDATE ON TABLE public\.customer_contractor_blocks/);
    expect(migration).toMatch(
      /REVOKE ALL ON FUNCTION public\.contractor_eligible_for_project\(uuid, uuid\) FROM PUBLIC, anon, authenticated/,
    );
    expect(migration).toMatch(/REVOKE ALL ON FUNCTION public\.list_my_contractor_blocks\(\) FROM PUBLIC, anon/);
    expect(migration).not.toMatch(/GRANT EXECUTE ON FUNCTION public\.list_my_contractor_blocks\(\) TO anon/);
    expect(migration).toMatch(/SET status = 'CLOSED'/);
    expect(migration).toMatch(/status = 'AVAILABLE'/);
  });
});
