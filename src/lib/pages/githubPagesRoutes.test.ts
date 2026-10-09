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
    expect(readFileSync(path.join(distDir, "404.html"), "utf8")).toBe(shell);
    for (const relativePath of spaShellDestinations("/faq")) {
      expect(readFileSync(path.join(distDir, relativePath), "utf8")).toBe(shell);
    }
    expect(readFileSync(path.join(distDir, "trust/index.html"), "utf8")).toBe(shell);
    expect(readFileSync(path.join(distDir, "trust.html"), "utf8")).toBe(shell);
    expect(readFileSync(path.join(distDir, "auth/reset-password/index.html"), "utf8")).toBe(shell);
    expect(readFileSync(path.join(distDir, "auth/reset-password.html"), "utf8")).toBe(shell);
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
