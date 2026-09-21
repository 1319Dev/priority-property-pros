import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const migrationsDir = path.join(root, "supabase/migrations");

function allSql(): string {
  return readdirSync(migrationsDir)
    .filter((name) => name.endsWith(".sql"))
    .sort()
    .map((name) => readFileSync(path.join(migrationsDir, name), "utf8"))
    .join("\n\n");
}

describe("platform_reviews SQL", () => {
  const sql = allSql();
  const latest = readFileSync(path.join(migrationsDir, "20261003000001_platform_reviews.sql"), "utf8");

  it("creates platform_reviews with rating, status, and RLS", () => {
    expect(latest).toMatch(/CREATE TABLE public\.platform_reviews/);
    expect(latest).toMatch(/ALTER TABLE public\.platform_reviews ENABLE ROW LEVEL SECURITY/);
    expect(latest).toMatch(/CONSTRAINT platform_reviews_rating_range CHECK \(rating BETWEEN 1 AND 5\)/);
    expect(latest).toMatch(/CONSTRAINT platform_reviews_one_per_user UNIQUE \(user_id\)/);
    expect(latest).toMatch(/status public\.platform_review_status/);
    expect(sql).toMatch(/CREATE TYPE public\.platform_review_status AS ENUM \('PENDING', 'APPROVED', 'REJECTED'\)/);
  });

  it("lets the public read approved rows, signed-in users insert their own, and admins moderate", () => {
    expect(latest).toMatch(/USING \(status = 'APPROVED'\)/);
    expect(latest).toMatch(/GRANT SELECT ON TABLE public\.platform_reviews TO anon, authenticated/);
    expect(latest).toMatch(/GRANT INSERT ON TABLE public\.platform_reviews TO authenticated/);
    expect(latest).toMatch(/WITH CHECK \(user_id = auth\.uid\(\)\)/);
    expect(latest).toMatch(/USING \(public\.is_admin\(\)\)/);
    expect(latest).toMatch(/only an admin can change a platform review/);
    expect(latest).toMatch(/NEW\.user_id := auth\.uid\(\)/);
    expect(latest).toMatch(/NEW\.status := 'APPROVED'/);
    expect(latest).not.toMatch(/GRANT INSERT ON TABLE public\.platform_reviews TO anon/);
    expect(latest).toMatch(/text_contains_contact_info/);
  });

  it("does not invent Google review claims or drop booking_reviews", () => {
    expect(latest).toMatch(/These are not Google reviews/);
    expect(sql).not.toMatch(/DROP TABLE public\.booking_reviews/i);
    expect(sql).not.toMatch(/Verified Google review/i);
  });
});
