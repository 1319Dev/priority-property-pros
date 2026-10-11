import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const migration = readFileSync(
  path.join(root, "supabase/migrations/20261014130000_admin_platform_review_moderation.sql"),
  "utf8",
);
const rollback = readFileSync(
  path.join(root, "supabase/rollbacks/20261014130000_admin_platform_review_moderation_rollback.sql"),
  "utf8",
);

describe("platform review moderation SQL", () => {
  it("requires a reason, audits the decision, and leaves the old update grant alone", () => {
    expect(migration).toMatch(/SECURITY DEFINER/);
    expect(migration).toMatch(/SET search_path = public/);
    expect(migration).toMatch(/IF NOT public\.is_admin\(\)/);
    expect(migration).toMatch(/42501/);
    expect(migration).toMatch(/char_length\(v_reason\) < 3 OR char_length\(v_reason\) > 500/);
    expect(migration).toMatch(/'APPROVED', 'REJECTED'/);
    expect(migration).toMatch(/platform_review\.approved/);
    expect(migration).toMatch(/platform_review\.rejected/);
    expect(migration).toMatch(/jsonb_build_object\('status', v_status, 'reason', v_reason\)/);
    expect(migration).not.toMatch(/\bemail\b/i);
    expect(migration).toMatch(/REVOKE ALL ON FUNCTION public\.admin_set_platform_review_status/);
    expect(migration).not.toMatch(/REVOKE[^;]*UPDATE/i);
    expect(migration).not.toMatch(/DROP POLICY/i);
    expect(rollback).toMatch(/DROP FUNCTION IF EXISTS public\.admin_set_platform_review_status\(uuid, text, text\)/);
    expect(rollback).not.toMatch(/DROP TABLE/i);
  });
});
