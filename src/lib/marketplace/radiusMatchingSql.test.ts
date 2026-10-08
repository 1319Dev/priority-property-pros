import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const dataMigration = "20261012000001_zip_centroids.sql";
const logicMigration = "20261012000002_radius_service_matching.sql";

function read(name: string): string {
  return readFileSync(path.join(repoRoot, "supabase/migrations", name), "utf8");
}

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
  const end = rest.indexOf("\nCREATE OR REPLACE FUNCTION public.", marker.length);
  return end === -1 ? rest : rest.slice(0, end);
}

describe("ZIP radius schema, matching, and RLS", () => {
  const data = read(dataMigration);
  const logic = read(logicMigration);
  const sql = allSql();
  const location = functionBody(sql, "location_matches");
  const infer = functionBody(sql, "infer_legacy_service_radii");
  const preview = functionBody(sql, "zip_service_area_preview");
  const eligible = functionBody(sql, "contractor_eligible_for_project");

  it("loads public-domain Census centroids and locks writes to admins", () => {
    expect(data).toMatch(/2023 Gazetteer/);
    expect(data).toMatch(/17 U\.S\.C\. § 105/);
    expect(data).toMatch(/CREATE TABLE public\.zip_centroids/);
    expect(data).toMatch(/33791 rows/);
    expect(data).toMatch(/\('77301',30\.309853,-95\.431280,'Conroe','TX'\)/);
    expect(data).toMatch(/CREATE INDEX zip_centroids_lat_lng_idx/);
    expect(data).toMatch(/ALTER TABLE public\.zip_centroids ENABLE ROW LEVEL SECURITY/);
    expect(data).toMatch(/GRANT SELECT ON TABLE public\.zip_centroids TO anon, authenticated/);
    expect(data).toMatch(/CREATE POLICY zip_centroids_select_public/);
    expect(data).toMatch(/CREATE POLICY zip_centroids_write_admin/);
    expect(data).toMatch(/USING \(public\.is_admin\(\)\)/);
    expect(data).toMatch(/WITH CHECK \(public\.is_admin\(\)\)/);
    expect(data).not.toMatch(/GRANT INSERT ON TABLE public\.zip_centroids TO anon/);
    expect(data).not.toMatch(/GRANT UPDATE ON TABLE public\.zip_centroids TO anon/);
    expect(data).not.toMatch(/GRANT DELETE ON TABLE public\.zip_centroids TO anon/);
    expect(data).not.toMatch(/payments_live/);
    expect(data).not.toMatch(/charges_live/);
  });

  it("matches centroid distance, falls back to legacy lists, and does not clear ZIP codes", () => {
    expect(location).toMatch(/zip_centroid_miles/);
    expect(location).toMatch(/radius_miles IS NOT NULL/);
    expect(location).toMatch(/zip = ANY \(normalized_zips\)/);
    expect(location).not.toMatch(/p_area\.center_lat/);
    expect(location).not.toMatch(/project_private_locations/);
    expect(eligible).toMatch(/location_matches\(proj\.zip_code/);
    expect(infer).toMatch(/radius_miles IS NULL/);
    expect(infer).toMatch(/sensible_radius_miles/);
    expect(infer).not.toMatch(/zip_codes\s*=/);
    expect(logic).toMatch(/Does not clear zip_codes/);
    expect(logic).toMatch(/SECURITY DEFINER/);
    expect(logic).toMatch(/SET search_path = public/);
    expect(logic).toMatch(/REVOKE ALL ON FUNCTION public\.infer_legacy_service_radii\(\) FROM PUBLIC, anon, authenticated/);
    expect(logic).toMatch(/REVOKE ALL ON FUNCTION public\.zip_service_area_preview\(text, numeric\) FROM PUBLIC, anon/);
    expect(logic).toMatch(/GRANT EXECUTE ON FUNCTION public\.zip_service_area_preview\(text, numeric\) TO authenticated/);
    expect(preview).toMatch(/sign in required/);
    expect(preview).toMatch(/Enter a valid US ZIP code/);
    expect(preview).toMatch(/Covers about /);
    expect(logic).toMatch(/contractor_public_service_label/);
    expect(logic).toMatch(/Serves within /);
    expect(logic).not.toMatch(/payments_live',\s*1/);
    expect(logic).not.toMatch(/charges_live',\s*1/);
    expect(logic).not.toMatch(/signup_fee_enabled',\s*1/);
    expect(logic).not.toMatch(/connection_fee_checkout_enabled',\s*1/);
  });
});
