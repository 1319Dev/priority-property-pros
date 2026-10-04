import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { futureLocalPath, FUTURE_LOCAL_PAGES_PUBLISHED } from "../features/local/futureLocalPage";
import { indexablePublicPaths, resolvePublicMeta } from "./publicSeo";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

describe("public page SEO", () => {
  it("gives public routes unique titles and descriptions", () => {
    const paths = ["/", "/find-a-pro", "/how-it-works", "/pricing", "/become-a-pro", "/faq", "/contact", "/reviews", "/trust", "/post-project", "/sign-in", "/sign-up"];
    const titles = paths.map((route) => resolvePublicMeta(route).title);
    const descriptions = paths.map((route) => resolvePublicMeta(route).description);
    expect(new Set(titles).size).toBe(titles.length);
    expect(new Set(descriptions).size).toBe(descriptions.length);
    expect(resolvePublicMeta("/").title).toMatch(/your choice/i);
    expect(resolvePublicMeta("/pricing").description).toMatch(/\$9\.99/);
    expect(resolvePublicMeta("/pricing").description).toMatch(/\$4\.99/);
    expect(resolvePublicMeta("/sign-in").robots).toBe("noindex,follow");
    expect(resolvePublicMeta("/app/customer").robots).toBe("noindex,follow");
  });

  it("lists only real indexable routes in the sitemap and blocks app routes in robots", () => {
    const robots = readFileSync(path.join(repoRoot, "public/robots.txt"), "utf8");
    const sitemap = readFileSync(path.join(repoRoot, "public/sitemap.xml"), "utf8");
    const locs = [...sitemap.matchAll(/<loc>([^<]+)<\/loc>/g)].map((match) => match[1]);
    const indexable = new Set(indexablePublicPaths().map((route) => (route === "/" ? "https://prioritypropertypros.com/" : `https://prioritypropertypros.com${route}`)));
    expect(locs.every((loc) => indexable.has(loc))).toBe(true);
    expect(locs).toContain("https://prioritypropertypros.com/post-project");
    expect(sitemap).not.toMatch(/\/local\/|\/app\/|\/login|\/signup/);
    expect(robots).toMatch(/Disallow:\s*\/app\//);
    expect(FUTURE_LOCAL_PAGES_PUBLISHED).toBe(false);
    expect(futureLocalPath("austin", "handyman")).toBeNull();
    const app = readFileSync(path.join(repoRoot, "src/App.tsx"), "utf8");
    expect(app).not.toMatch(/path="\/local/);
  });
});
