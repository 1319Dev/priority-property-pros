import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const name = "20261019500001_stripe_price_ids_by_mode.sql";
const mig = readFileSync(path.join(root, "supabase/migrations", name), "utf8");
const rb = readFileSync(path.join(root, "supabase/rollbacks/20261019500001_stripe_price_ids_by_mode_rollback.sql"), "utf8");
const TEST_ACTIVATION = "price_1UH1SePYJQAIQDv7nrMo32Xp";
const TEST_CONNECTION = "price_1UH1RsPYJQAIQDv721IhjKS0";

describe("stripe price ids by mode", () => {
  it("keeps TEST ids for stripe_test_mode = 1 and adds distinct LIVE ids", () => {
    expect(mig).toMatch(/WHEN public\.stripe_test_mode_enabled\(\) THEN 'price_1UH1SePYJQAIQDv7nrMo32Xp'/);
    expect(mig).toMatch(/WHEN public\.stripe_test_mode_enabled\(\) THEN 'price_1UH1RsPYJQAIQDv721IhjKS0'/);
    const live = [...mig.matchAll(/ELSE '(price_[A-Za-z0-9]+)'/g)].map((m) => m[1]);
    expect(live).toHaveLength(2);
    expect(new Set([...live, TEST_ACTIVATION, TEST_CONNECTION]).size).toBe(4);
  });

  it("does not touch fees, secrets, rows, or live switches", () => {
    expect(mig).not.toMatch(/UPDATE|INSERT|DELETE|ALTER TABLE/i);
    expect(mig).not.toMatch(/signup_fee_cents|connection_fee_cents|payments_live =|charges_live =/);
  });

  it("rolls back to the old constant helpers", () => {
    expect(rb).toMatch(new RegExp(`SELECT '${TEST_ACTIVATION}'`));
    expect(rb).toMatch(new RegExp(`SELECT '${TEST_CONNECTION}'`));
    expect(rb.match(/^IMMUTABLE$/gm)).toHaveLength(2);
  });

  it("is the only migration with this version and the last helper definition", () => {
    const names = readdirSync(path.join(root, "supabase/migrations")).sort();
    expect(names.filter((n) => n.startsWith("20261019500001"))).toEqual([name]);
    for (const later of names.filter((n) => n > name)) {
      const sql = readFileSync(path.join(root, "supabase/migrations", later), "utf8");
      expect(sql, later).not.toMatch(/FUNCTION public\.stripe_(activation|connection)_price_id/);
    }
  });
});
