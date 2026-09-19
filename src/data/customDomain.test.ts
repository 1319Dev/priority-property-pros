import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

describe("custom domain at site root", () => {
  it("publishes CNAME for prioritypropertypros.com", () => {
    const cname = readFileSync(path.join(repoRoot, "public/CNAME"), "utf8");
    expect(cname).toBe("prioritypropertypros.com\n");
  });

  it("builds production Pages at the custom-domain root", () => {
    const workflow = readFileSync(path.join(repoRoot, ".github/workflows/ci-pages.yml"), "utf8");
    expect(workflow).toMatch(/BASE_PATH:\s*\/\s*$/m);
    expect(workflow).not.toMatch(/BASE_PATH:\s*\/priority-property-pros\//);
    expect(workflow).toMatch(/prioritypropertypros\.com/);
  });

  it("uses BASE_URL for index assets and canonical tags", () => {
    const html = readFileSync(path.join(repoRoot, "index.html"), "utf8");
    expect(html).toMatch(/rel="canonical" href="https:\/\/prioritypropertypros\.com\/"/);
    expect(html).toMatch(/property="og:url" content="https:\/\/prioritypropertypros\.com\/"/);
    expect(html).toMatch(/property="og:image" content="%BASE_URL%og-image.svg"/);
    expect(html).toMatch(/twitter:image" content="%BASE_URL%og-image.svg"/);
    expect(html).not.toMatch(/github\.io/);
    expect(html).not.toMatch(/\/priority-property-pros\//);
  });

  it("does not hardcode github.io project-path assets in public files", () => {
    const robots = readFileSync(path.join(repoRoot, "public/robots.txt"), "utf8");
    const sitemap = readFileSync(path.join(repoRoot, "public/sitemap.xml"), "utf8");
    expect(robots).not.toMatch(/github\.io/);
    expect(robots).not.toMatch(/\/priority-property-pros\//);
    expect(robots).toMatch(/https:\/\/prioritypropertypros\.com\/sitemap\.xml/);
    expect(sitemap).not.toMatch(/github\.io/);
    expect(sitemap).not.toMatch(/\/priority-property-pros\//);
    expect(sitemap).toMatch(/https:\/\/prioritypropertypros\.com\//);
  });
});
