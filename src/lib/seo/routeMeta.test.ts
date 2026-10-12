import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { FIND_A_PRO_DOCUMENT_TITLE } from "../marketplace/findAPro";
import { GITHUB_PAGES_SPA_ROUTES } from "../pages/githubPagesFallback";
import { DEFAULT_DESCRIPTION, ROUTE_META, canonicalUrl, isNoindexPath, metaForPath } from "./routeMeta";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");

describe("route meta", () => {
  it("builds self-referencing canonicals without trailing slashes or query strings", () => {
    expect(canonicalUrl("/")).toBe("https://prioritypropertypros.com/");
    expect(canonicalUrl("/pricing/")).toBe("https://prioritypropertypros.com/pricing");
    expect(canonicalUrl("/find-a-pro?service=painting")).toBe("https://prioritypropertypros.com/find-a-pro");
    expect(canonicalUrl("/find-a-pro/abc")).toBe("https://prioritypropertypros.com/find-a-pro/abc");
  });

  it("keeps app, auth, and account pages out of search", () => {
    for (const p of ["/app/admin", "/app/customer/projects/1", "/auth/reset-password", "/account/activate", "/sign-in", "/notifications", "/forgot-password"]) {
      expect(isNoindexPath(p)).toBe(true);
    }
    for (const p of ["/", "/pricing", "/find-a-pro", "/find-a-pro/abc", "/sign-up", "/how-it-works", "/become-a-pro", "/application"]) {
      expect(isNoindexPath(p)).toBe(false);
    }
  });

  it("gives every public sitemap page a unique title and description", () => {
    const sitemap = readFileSync(path.join(repoRoot, "public/sitemap.xml"), "utf8");
    const paths = [...sitemap.matchAll(/<loc>https:\/\/prioritypropertypros\.com([^<]*)<\/loc>/g)].map((m) => m[1] || "/");
    expect(paths.length).toBeGreaterThan(5);
    const titles = new Set<string>();
    const descriptions = new Set<string>();
    for (const p of paths) {
      const meta = metaForPath(p);
      expect(meta.title, p).toBeTruthy();
      expect(meta.noindex, p).toBe(false);
      titles.add(meta.title as string);
      descriptions.add(meta.description);
    }
    expect(titles.size).toBe(paths.length);
    expect(descriptions.size).toBe(paths.length);
  });

  it("matches the Find a Pro page's own title so the runtime does not flicker", () => {
    expect(ROUTE_META["/find-a-pro"].title).toBe(FIND_A_PRO_DOCUMENT_TITLE);
  });

  it("only describes routes that have a static shell", () => {
    for (const p of Object.keys(ROUTE_META)) {
      if (p === "/") continue;
      expect(GITHUB_PAGES_SPA_ROUTES as readonly string[]).toContain(p);
    }
  });

  it("states fees accurately and never mentions a commission or a monthly price", () => {
    for (const meta of [...Object.values(ROUTE_META).map((m) => m.description), DEFAULT_DESCRIPTION]) {
      expect(meta.replace(/not \$9\.99\s*\/\s*month/gi, "")).not.toMatch(/\$(?!0\/)\d+(\.\d+)?\s*\/\s*month/i);
      expect(meta).not.toMatch(/commission|free to join|\d+%/i);
      const prices = meta.match(/\$\d+(\.\d+)?/g) ?? [];
      for (const price of prices) expect(["$9.99", "$4.99", "$0"]).toContain(price);
    }
  });
});
