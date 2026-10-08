import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const migrationName = "20261011000005_project_connection_cards.sql";

function sql(): string {
  return readFileSync(path.join(repoRoot, "supabase/migrations", migrationName), "utf8");
}

describe("project connection cards", () => {
  const text = sql();

  it("returns a display name, statuses, and the existing message gate for the project owner", () => {
    expect(text).toMatch(/CREATE OR REPLACE FUNCTION public\.list_my_project_connection_cards\(p_project_id uuid\)/);
    expect(text).toMatch(/SECURITY DEFINER/);
    expect(text).toMatch(/SET search_path = public/);
    expect(text).toMatch(/p\.customer_id = \(SELECT auth\.uid\(\)\)/);
    expect(text).toMatch(/public\.is_admin\(\)/);
    expect(text).toMatch(/'display_name'/);
    expect(text).toMatch(/cp\.business_name/);
    expect(text).toMatch(/public\.anonymized_pro_label/);
    expect(text).toMatch(/public\.text_contains_contact_info\(cp\.business_name\)/);
    expect(text).toMatch(/public\.message_pair_has_connection_entitlement/);
    expect(text).toMatch(/'connection_status'/);
    expect(text).toMatch(/'booking_status'/);
    expect(text).toMatch(/'can_message'/);
    expect(text).toMatch(/b\.status IS DISTINCT FROM 'CANCELLED'/);
    expect(text).toMatch(/GRANT EXECUTE ON FUNCTION public\.list_my_project_connection_cards\(uuid\) TO authenticated/);
    expect(text).toMatch(/REVOKE ALL ON FUNCTION public\.list_my_project_connection_cards\(uuid\) FROM PUBLIC, anon/);
  });

  it("does not expose contact or fee fields and does not write payments", () => {
    expect(text).not.toMatch(/'business_name'/);
    expect(text).not.toMatch(/'phone'/);
    expect(text).not.toMatch(/'email'/);
    expect(text).not.toMatch(/'street'/);
    expect(text).not.toMatch(/'fee_cents'/);
    expect(text).not.toMatch(/payments_live/);
    expect(text).not.toMatch(/charges_live/);
    expect(text).not.toMatch(/lock_booking_fee/);
    expect(text).not.toMatch(/UPDATE public\.project_connections/);
    expect(text).not.toMatch(/9106a50b/);
  });
});
