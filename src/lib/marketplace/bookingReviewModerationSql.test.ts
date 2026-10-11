import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const migration = readFileSync(
  path.join(repoRoot, "supabase/migrations/20261019200002_booking_review_moderation.sql"),
  "utf8",
);
const rollback = readFileSync(
  path.join(repoRoot, "supabase/rollbacks/20261019200002_booking_review_moderation_rollback.sql"),
  "utf8",
);

function extractFunction(sql: string, name: string): string {
  const marker = `CREATE OR REPLACE FUNCTION public.${name}`;
  const start = sql.indexOf(marker);
  expect(start, name).toBeGreaterThan(-1);
  const rest = sql.slice(start);
  const end = rest.indexOf("\n$$;");
  expect(end, name).toBeGreaterThan(-1);
  return rest.slice(0, end);
}

describe("booking review moderation migration", () => {
  it("keeps submit and edit rules, and hides only with evidence", () => {
    expect(migration).not.toMatch(/CREATE OR REPLACE FUNCTION public\.submit_booking_review\(/);
    expect(migration).not.toMatch(/CREATE OR REPLACE FUNCTION public\.update_booking_review\(/);
    expect(migration).not.toMatch(/apply_customer_low_rating_block/);
    expect(migration).not.toMatch(/booking_review_edit_window_days/);
    expect(migration).not.toMatch(/stripe/i);
    expect(migration).not.toMatch(/payments_live/i);
    expect(migration).not.toMatch(/DELETE FROM public\.booking_reviews/);
    expect(migration).toMatch(/hidden_at IS NULL/);
    expect(migration).toMatch(/a review cannot be hidden only because of its rating/);
    expect(migration).toMatch(/only the other party can report this review/);
    expect(migration).toMatch(/text_contains_contact_info\(v_body\)/);
    expect(migration).toMatch(/booking_review\.hidden/);
    expect(migration).toMatch(/booking_review\.reported/);
    expect(migration).toMatch(/content_reports_one_booking_review_report/);
    expect(migration).toMatch(/GRANT EXECUTE ON FUNCTION public\.admin_hide_booking_review\(uuid, text\) TO authenticated/);
    expect(migration).toMatch(/REVOKE ALL ON FUNCTION public\.admin_hide_booking_review\(uuid, text\) FROM PUBLIC, anon/);
    expect(migration).not.toMatch(/GRANT EXECUTE ON FUNCTION public\.admin_hide_booking_review\(uuid, text\) TO anon/);

    const hide = extractFunction(migration, "admin_hide_booking_review");
    expect(hide).not.toMatch(/rating\s*[<>=]/);
    expect(hide).toMatch(/booking_review_moderation_reason_is_rating_only/);
    expect(hide).not.toMatch(/DELETE FROM/);

    const listed = migration.slice(migration.indexOf("CREATE FUNCTION public.list_public_directory_reviews"));
    expect(listed).toMatch(/SELECT r\.id, r\.rating, r\.body, r\.contractor_response/);
    expect(listed).not.toMatch(/business_name|website_url|p\.email|p\.phone/);
  });

  it("rolls the public views back without deleting review rows", () => {
    expect(rollback).toMatch(/DROP FUNCTION IF EXISTS public\.admin_hide_booking_review\(uuid, text\)/);
    expect(rollback).toMatch(/DROP FUNCTION IF EXISTS public\.list_public_directory_reviews\(uuid\)/);
    expect(rollback).toMatch(/DROP VIEW IF EXISTS public\.contractor_public_reviews/);
    expect(rollback).toMatch(/DROP COLUMN IF EXISTS hidden_at/);
    expect(rollback).not.toMatch(/DELETE FROM public\.booking_reviews/);
    expect(rollback).not.toMatch(/DELETE FROM public\.content_reports/);
    expect(rollback).not.toMatch(/hidden_at IS NULL/);
    expect(rollback).not.toMatch(/stripe/i);
  });
});
