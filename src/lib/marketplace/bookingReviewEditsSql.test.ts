import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const migration = readFileSync(
  path.join(repoRoot, "supabase/migrations/20261013000003_booking_review_edits.sql"),
  "utf8",
);
const rollback = readFileSync(
  path.join(repoRoot, "supabase/rollbacks/20261013000003_booking_review_edits_rollback.sql"),
  "utf8",
);

describe("booking review edit migration", () => {
  it("adds an edit trail and an author-only RPC without touching public views or review text", () => {
    expect(migration).toMatch(/booking_review_edit_window_days/);
    expect(migration).toMatch(/ADD COLUMN IF NOT EXISTS updated_at timestamptz/);
    expect(migration).toMatch(/ADD COLUMN IF NOT EXISTS edited_at timestamptz/);
    expect(migration).toMatch(/SET updated_at = created_at/);
    expect(migration).not.toMatch(/SET updated_at = created_at[\s\S]{0,40}(rating|body)/);
    expect(migration).toMatch(/CREATE OR REPLACE FUNCTION public\.update_booking_review/);
    expect(migration).toMatch(/only booking participants can review after mutual hire/);
    expect(migration).toMatch(/rating must be 1 through 5/);
    expect(migration).toMatch(/you have not reviewed this booking/);
    expect(migration).toMatch(/the review edit window has closed/);
    expect(migration).toMatch(/is_verified = true/);
    expect(migration).toMatch(/write_audit_log/);
    expect(migration).toMatch(/'old_rating'/);
    expect(migration).toMatch(/'new_rating'/);
    expect(migration).toMatch(/'old_body'/);
    expect(migration).toMatch(/'new_body'/);
    expect(migration).toMatch(/REVOKE ALL ON FUNCTION public\.update_booking_review\(uuid, integer, text\) FROM PUBLIC, anon/);
    expect(migration).toMatch(/GRANT EXECUTE ON FUNCTION public\.update_booking_review\(uuid, integer, text\) TO authenticated/);
    expect(migration).not.toMatch(/CREATE OR REPLACE VIEW public\.contractor_public_ratings/);
    expect(migration).not.toMatch(/CREATE OR REPLACE VIEW public\.contractor_public_reviews/);
    expect(migration).not.toMatch(/CREATE POLICY/);
    expect(migration).not.toMatch(/payments_live/i);
    expect(migration).not.toMatch(/charges_live/i);
    expect(migration).not.toMatch(/stripe/i);
    expect(migration).not.toMatch(/DROP CONSTRAINT booking_reviews_one_per_role/);
  });

  it("rolls back only the edit function, columns, and setting", () => {
    expect(rollback).toMatch(/DROP FUNCTION IF EXISTS public\.update_booking_review\(uuid, integer, text\)/);
    expect(rollback).toMatch(/DROP COLUMN IF EXISTS edited_at/);
    expect(rollback).toMatch(/DROP COLUMN IF EXISTS updated_at/);
    expect(rollback).toMatch(/DELETE FROM public\.platform_settings WHERE key = 'booking_review_edit_window_days'/);
    expect(rollback).not.toMatch(/UPDATE public\.booking_reviews/);
    expect(rollback).not.toMatch(/CREATE OR REPLACE VIEW/);
    expect(rollback).not.toMatch(/DROP VIEW/);
    expect(rollback).not.toMatch(/DROP CONSTRAINT/);
  });
});
