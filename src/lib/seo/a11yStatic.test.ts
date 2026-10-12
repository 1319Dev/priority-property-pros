import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const full = path.join(dir, name);
    if (statSync(full).isDirectory()) return sourceFiles(full);
    return /\.(tsx|ts)$/.test(name) && !/\.test\./.test(name) ? [full] : [];
  });
}

describe("static accessibility guards", () => {
  it("does not use gold-600 for text (3.3:1 on cream fails WCAG AA); the logo wordmark is exempt", () => {
    const offenders = sourceFiles(path.join(repoRoot, "src"))
      .filter((file) => !file.endsWith(path.join("brand", "Logo.tsx")))
      .filter((file) => /\btext-gold-600\b/.test(readFileSync(file, "utf8")))
      .map((file) => path.relative(repoRoot, file));
    expect(offenders).toEqual([]);
  });

  it("turns off smooth scrolling for people who ask for reduced motion", () => {
    const css = readFileSync(path.join(repoRoot, "src/index.css"), "utf8");
    expect(css).toMatch(/prefers-reduced-motion: reduce\)\s*{\s*html\s*{\s*scroll-behavior: auto;/);
  });

  it("ships a valid, raster social preview image and an XML-safe SVG", () => {
    const png = readFileSync(path.join(repoRoot, "public/og-image.png"));
    expect(png.subarray(1, 4).toString()).toBe("PNG");
    expect(png.readUInt32BE(16)).toBe(1200);
    expect(png.readUInt32BE(20)).toBe(630);
    // eslint-disable-next-line no-control-regex
    expect(readFileSync(path.join(repoRoot, "public/og-image.svg"), "utf8")).not.toMatch(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/);
  });

  it("publishes Organization and WebSite structured data", () => {
    const html = readFileSync(path.join(repoRoot, "index.html"), "utf8");
    const match = html.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/);
    expect(match).not.toBeNull();
    const data = JSON.parse(match![1]) as { "@graph": Array<{ "@type": string; url?: string }> };
    expect(data["@graph"].map((n) => n["@type"]).sort()).toEqual(["Organization", "WebSite"]);
    for (const node of data["@graph"]) expect(node.url).toBe("https://prioritypropertypros.com/");
  });
});
