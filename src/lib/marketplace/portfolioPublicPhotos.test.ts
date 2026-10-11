import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { publicPortfolioImageUrl, toPublicPortfolioPhoto } from "./publicDirectory";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const migration = readFileSync(
  path.join(root, "supabase/migrations/20261016000002_public_portfolio_signed_reads.sql"),
  "utf8",
);
const rollback = readFileSync(
  path.join(root, "supabase/rollbacks/20261016000002_public_portfolio_signed_reads_rollback.sql"),
  "utf8",
);
const loader = readFileSync(path.join(root, "src/lib/marketplace/findAProApi.ts"), "utf8");
const api = readFileSync(path.join(root, "src/lib/marketplace/api.ts"), "utf8");

const signed = "https://example.supabase.co/storage/v1/object/sign/contractor-docs/user/portfolio/cedar.jpg?token=abc";

describe("public portfolio photo display", () => {
  it("keeps a signed URL and drops a public-bucket URL", () => {
    expect(publicPortfolioImageUrl(signed)).toBe(signed);
    expect(
      publicPortfolioImageUrl("https://example.supabase.co/storage/v1/object/public/contractor-docs/user/portfolio/cedar.jpg"),
    ).toBeNull();
    expect(publicPortfolioImageUrl("user/portfolio/secret.jpg")).toBeNull();
    const photo = toPublicPortfolioPhoto({
      id: "p1",
      caption: "Reset a cedar panel",
      imageUrl: signed,
      storagePath: "user/portfolio/secret-name.jpg",
    });
    expect(photo.imageUrl).toBe(signed);
    expect(photo.imageStatus).toBe("ready");
    expect(photo).not.toHaveProperty("storagePath");
    expect(photo).not.toHaveProperty("storage_path");
    expect(
      toPublicPortfolioPhoto({
        id: "p2",
        caption: "Portfolio photo",
        imageUrl: "https://example.supabase.co/storage/v1/object/public/contractor-docs/a.jpg",
        storagePath: "user/portfolio/pending.jpg",
      }).imageUrl,
    ).toBeUndefined();
  });

  it("lets anon read only a publicly readable portfolio object and never opens the bucket", () => {
    expect(migration).toMatch(/list_public_portfolio_objects/);
    expect(migration).toMatch(/contractor_public_portfolio/);
    expect(migration).toMatch(/pf\.privacy_state = 'PUBLIC_SAFE'/);
    expect(migration).toMatch(/GRANT EXECUTE ON FUNCTION public\.list_public_portfolio_objects\(uuid\) TO anon, authenticated/);
    expect(migration).toMatch(/GRANT EXECUTE ON FUNCTION public\.portfolio_storage_is_publicly_readable\(text\) TO anon/);
    expect(migration).toMatch(/CREATE POLICY contractor_docs_storage_select/);
    expect(migration).toMatch(/FOR SELECT TO anon, authenticated/);
    expect(migration).toMatch(/portfolio_storage_is_publicly_readable\(name\)/);
    expect(migration).not.toMatch(/\/object\/public\//);
    expect(migration).not.toMatch(/getPublicUrl/);
    expect(migration).not.toMatch(/privacy_state = 'REVIEW_REQUIRED'/);
    expect(migration).not.toMatch(/privacy_state = 'PRIVATE'/);
    expect(migration).not.toMatch(/INSERT\s+INTO/i);
    expect(migration).not.toMatch(/UPDATE\s+public\.contractor_portfolio/i);
    expect(migration).not.toMatch(/stripe|payments_live|connection_fee/i);
    expect(rollback).toMatch(/DROP FUNCTION IF EXISTS public\.list_public_portfolio_objects\(uuid\)/);
    expect(rollback).toMatch(/FOR SELECT TO authenticated/);
    expect(rollback).toMatch(/REVOKE ALL ON FUNCTION public\.portfolio_storage_is_publicly_readable\(text\) FROM anon/);
    expect(loader).toMatch(/signedContractorDocUrl/);
    expect(loader).not.toMatch(/getPublicUrl/);
    expect(api).not.toMatch(/getPublicUrl/);
    expect(api).toMatch(/createSignedUrl/);
  });
});
