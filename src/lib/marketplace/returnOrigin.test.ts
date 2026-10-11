import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { allowedReturnOrigin } from "./connectionCheckout";
import { originIsAllowed } from "../../../supabase/functions/_shared/returnOrigin.ts";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");

const allowed = [
  "https://prioritypropertypros.com",
  "https://prioritypropertypros.com/",
  "https://www.prioritypropertypros.com",
  "http://localhost:5173",
  "http://127.0.0.1:4173",
];

const rejected = [
  "",
  "https://evil.example",
  "https://prioritypropertypros.com.evil.example",
  "http://prioritypropertypros.com",
  "https://user:pass@prioritypropertypros.com",
  "https://prioritypropertypros.com/account/activate",
  "https://prioritypropertypros.com?next=https://evil.example",
  "https://prioritypropertypros.com#fragment",
  "http://localhost.evil.example",
  "javascript:alert(1)",
];

describe("checkout return origins", () => {
  it("allows only this site and local http origins", () => {
    for (const origin of allowed) {
      expect(allowedReturnOrigin(origin), origin).toBe(true);
      expect(originIsAllowed(origin), origin).toBe(true);
    }
    for (const origin of rejected) {
      expect(allowedReturnOrigin(origin), origin).toBe(false);
      expect(originIsAllowed(origin), origin).toBe(false);
    }
  });

  it("accepts an extra https origin only when that origin is configured", () => {
    const preview = "https://preview.example.com";
    expect(originIsAllowed(preview)).toBe(false);
    expect(originIsAllowed(preview, { extraOrigins: preview })).toBe(true);
    expect(originIsAllowed(preview, { siteUrl: preview })).toBe(true);
    expect(allowedReturnOrigin(preview)).toBe(false);
    expect(allowedReturnOrigin(preview, preview)).toBe(true);
    expect(originIsAllowed("http://preview.example.com", { siteUrl: "http://preview.example.com" })).toBe(false);
  });

  it("is what both checkout functions use to build success and cancel URLs", () => {
    const helper = readFileSync(path.join(root, "supabase/functions/_shared/supabase.ts"), "utf8");
    expect(helper).toMatch(/originIsAllowed/);
    expect(helper).toMatch(/SITE_URL/);
    expect(helper).toMatch(/ALLOWED_RETURN_ORIGINS/);
    expect(helper).not.toMatch(/return Boolean\(url\.hostname\)/);
    for (const name of ["create-signup-fee-checkout", "create-connection-checkout"]) {
      const source = readFileSync(path.join(root, "supabase/functions", name, "index.ts"), "utf8");
      expect(source).toContain("allowedOrigin(origin)");
      expect(source).toContain("success_url: `${origin}");
      expect(source).toContain("cancel_url: `${origin}");
      expect(source).not.toContain("success_url: body.success_url");
      expect(source).not.toContain("cancel_url: body.cancel_url");
    }
  });
});
