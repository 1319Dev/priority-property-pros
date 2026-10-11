import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { GITHUB_PAGES_SPA_ROUTES, spaShellDestinations, writeSpaShells } from "./githubPagesFallback";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");

function staticAbsoluteRoutes(source: string): string[] {
  return [...source.matchAll(/path="(\/[^"]+)"/g)]
    .map((match) => match[1])
    .filter((route) => !route.includes(":"));
}

describe("GitHub Pages SPA shells", () => {
  it("covers every static absolute route, including the public pages that 404 today", () => {
    const app = readFileSync(path.join(repoRoot, "src/App.tsx"), "utf8");
    const routes = staticAbsoluteRoutes(app);
    expect(routes.length).toBeGreaterThan(0);
    for (const route of [
      "/find-a-pro",
      "/become-a-pro",
      "/faq",
      "/contact",
      "/pricing",
      "/how-it-works",
      "/trust",
      "/reviews",
    ]) {
      expect(GITHUB_PAGES_SPA_ROUTES).toContain(route);
    }
    expect([...GITHUB_PAGES_SPA_ROUTES].sort()).toEqual([...routes].sort());
  });

  it("copies the app shell to 404.html and to each route file", () => {
    const distDir = mkdtempSync(path.join(tmpdir(), "ppp-spa-"));
    mkdirSync(distDir, { recursive: true });
    const shell = "<!doctype html><title>Priority Property Pros</title>";
    writeFileSync(path.join(distDir, "index.html"), shell);
    writeSpaShells(distDir);
    for (const relativePath of ["404.html", ...spaShellDestinations("/faq"), "trust/index.html", "trust.html", "auth/reset-password/index.html", "auth/reset-password.html"]) {
      expect(readFileSync(path.join(distDir, relativePath), "utf8")).toMatch(/^<!doctype html><title>[^<]+<\/title>/);
    }
  });

  it("gives each route shell its own title, description, canonical, and robots tags", () => {
    const distDir = mkdtempSync(path.join(tmpdir(), "ppp-spa-meta-"));
    const index = readFileSync(path.join(repoRoot, "index.html"), "utf8");
    writeFileSync(path.join(distDir, "index.html"), index);
    writeSpaShells(distDir);
    const read = (p: string) => readFileSync(path.join(distDir, p), "utf8");

    const pricing = read("pricing/index.html");
    expect(pricing).toMatch(/<title>Pricing \| Priority Property Pros<\/title>/);
    expect(pricing).toMatch(/<link rel="canonical" href="https:\/\/prioritypropertypros\.com\/pricing"/);
    expect(pricing).toMatch(/property="og:url" content="https:\/\/prioritypropertypros\.com\/pricing"/);
    expect(pricing).toMatch(/name="description"\s+content="A one-time \$9\.99 account activation/);
    expect(pricing).not.toMatch(/name="robots"/);
    expect(read("pricing.html")).toBe(pricing);

    expect(read("find-a-pro/index.html")).toMatch(/<link rel="canonical" href="https:\/\/prioritypropertypros\.com\/find-a-pro"/);
    expect(read("app/admin/index.html")).toMatch(/<meta name="robots" content="noindex" \/>/);
    expect(read("sign-in/index.html")).toMatch(/<meta name="robots" content="noindex" \/>/);
    expect(read("auth/reset-password/index.html")).toMatch(/<meta name="robots" content="noindex" \/>/);

    const notFound = read("404.html");
    expect(notFound).toMatch(/<meta name="robots" content="noindex" \/>/);
    expect(notFound).toMatch(/<title>Page not found \| Priority Property Pros<\/title>/);
    expect(notFound).not.toMatch(/rel="canonical"/);
    expect(notFound).not.toMatch(/property="og:url"/);
    // Fragment-preserving behavior is untouched: still the full app shell, no redirect script.
    expect(notFound).toMatch(/<div id="root"><\/div>/);
    expect(notFound).not.toMatch(/location\.replace/);
  });

  it("does not rewrite /auth/reset-password through a fragment-dropping 404 redirect", () => {
    const index = readFileSync(path.join(repoRoot, "index.html"), "utf8");
    expect(GITHUB_PAGES_SPA_ROUTES).toContain("/auth/reset-password");
    expect(index).not.toMatch(/pathSegmentsToKeep|location\.replace|history\.replaceState/);
    expect(spaShellDestinations("/auth/reset-password")).toEqual([
      "auth/reset-password.html",
      "auth/reset-password/index.html",
    ]);
  });
});
