import { readFileSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { render, screen } from "@testing-library/react";
import sharp from "sharp";
import { describe, expect, it } from "vitest";
import { BrandLoader, FULL_PAGE_LOADER, LoaderSlot } from "./BrandLoader";

const brandDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)));
const css = readFileSync(path.resolve(brandDir, "../../index.css"), "utf8");
const indexHtml = readFileSync(path.resolve(brandDir, "../../../index.html"), "utf8");
const repoRoot = path.resolve(brandDir, "../../..");

describe("BrandLoader", () => {
  it("announces Loading and keeps a fixed box", () => {
    render(<BrandLoader />);
    const status = screen.getByRole("status");
    expect(status).toHaveAttribute("aria-live", "polite");
    expect(status).toHaveAccessibleName("Loading…");
    expect(status).toHaveTextContent("Loading…");
    expect(status.className).toContain("min-h-36");
    expect(status.querySelector(".brand-loader-arc")).toBeTruthy();
    expect(status.querySelector(".brand-loader-mark")).toBeTruthy();
    expect(status.querySelector(".brand-loader-swing")).toBeNull();
    expect(status.querySelector("p")?.className).toContain("text-ink-500");
  });

  it("uses the circular logo on full-page and inline loaders", () => {
    expect(FULL_PAGE_LOADER).toBe("logo");

    const { unmount } = render(<BrandLoader layout="page" />);
    const page = screen.getByRole("status");
    expect(page.className).toContain("min-h-[70vh]");
    const svg = page.querySelector("svg");
    expect(svg).toHaveAttribute("width", "96");
    expect(svg).toHaveAttribute("height", "96");
    const circles = page.querySelectorAll(".brand-loader-arc circle");
    expect(circles).toHaveLength(2);
    expect(circles[0]).toHaveAttribute("cx", "36");
    expect(circles[0]).toHaveAttribute("cy", "36");
    expect(circles[0]).toHaveAttribute("stroke", "#002450");
    expect(circles[1]).toHaveAttribute("stroke-dasharray", "28 72");
    expect(circles[1].getAttribute("stroke")).toMatch(/^url\(#brand-loader-sweep-/);
    expect(page.querySelector("linearGradient stop:last-child")).toHaveAttribute("stop-color", "#53A217");
    const img = page.querySelector("img");
    expect(img).toHaveAttribute("alt", "");
    expect(img).toHaveAttribute("width", "85");
    expect(Number(img?.getAttribute("width"))).toBeLessThan(96);
    expect(img?.closest("svg")).toBeNull();
    expect(img?.className).not.toContain("brand-loader-arc");
    expect(page.querySelector("source")).toHaveAttribute("type", "image/webp");
    expect(page.querySelector("source")?.getAttribute("srcset")).toContain("ppp-loader-mark-256.webp");
    expect(page.querySelector("source")?.getAttribute("srcset")).toContain("ppp-loader-mark-512.webp");
    expect(img?.getAttribute("src")).toContain("ppp-loader-mark-512.png");
    expect(img?.getAttribute("srcset")).toContain("ppp-loader-mark-256.png");
    expect(page.querySelector("p")?.className).toContain("font-sans");
    unmount();

    render(<BrandLoader layout="inline" label="Loading…" />);
    const inline = screen.getByRole("status");
    expect(inline.className).toContain("flex-row");
    expect(inline.querySelector("svg")).toHaveAttribute("width", "28");
    expect(inline.querySelector("img")).toHaveAttribute("width", "25");
    expect(inline.querySelector(".brand-loader-arc")).toBeTruthy();
    expect(inline.querySelector(".brand-loader-mark")).toBeTruthy();
  });

  it("reserves header and nav space with a skeleton and no visible caption", () => {
    const { unmount } = render(<LoaderSlot />);
    const slot = screen.getByRole("status");
    expect(slot).toHaveAccessibleName("Loading…");
    expect(slot).not.toHaveTextContent("Loading");
    expect(slot.querySelector(".brand-loader-skeleton")).toBeTruthy();
    expect(slot.querySelector("svg")).toBeNull();
    unmount();

    render(<LoaderSlot compact />);
    expect(screen.getByRole("status").className).toContain("max-w-16");
  });

  it("holds the arc still when motion is reduced", () => {
    expect(css).toMatch(/@keyframes brand-loader-arc-spin/);
    expect(css).toMatch(/brand-loader-arc-spin 1s linear infinite/);
    expect(css).not.toMatch(/brand-loader-tap/);
    expect(css).not.toMatch(/brand-loader-swing/);
    expect(css).toMatch(/prefers-reduced-motion:\s*reduce/);
    const reduced = css.slice(css.indexOf("prefers-reduced-motion"));
    expect(reduced).toMatch(/\.brand-loader-arc\s*,[\s\S]*animation:\s*none/);
    expect(reduced).not.toMatch(/brand-loader-mark/);
  });

  it("preloads the circular mark so the loader can paint with the document", () => {
    expect(indexHtml).toMatch(/rel="preload"/);
    expect(indexHtml).toMatch(/as="image"/);
    expect(indexHtml).toMatch(/%BASE_URL%brand\/ppp-loader-mark-256\.webp/);
    expect(indexHtml).toMatch(/%BASE_URL%brand\/ppp-loader-mark-512\.webp/);
    expect(indexHtml).toMatch(/type="image\/webp"/);
  });

  it("ships a transparent inner mark at 256 and 512 under 60KB", async () => {
    for (const size of [256, 512]) {
      for (const ext of ["webp", "png"] as const) {
        const file = path.join(repoRoot, "public/brand", `ppp-loader-mark-${size}.${ext}`);
        const meta = await sharp(file).metadata();
        expect(statSync(file).size).toBeLessThan(60 * 1024);
        expect(meta.width).toBe(size);
        expect(meta.height).toBe(size);
        expect(meta.hasAlpha).toBe(true);
      }
      const { data, info } = await sharp(path.join(repoRoot, "public/brand", `ppp-loader-mark-${size}.png`))
        .ensureAlpha()
        .raw()
        .toBuffer({ resolveWithObject: true });
      expect(data[3]).toBe(0);
      const edge = (Math.floor(info.height / 2) * info.width + 3) * info.channels;
      expect(data[edge]).toBeGreaterThan(230);
      expect(data[edge + 2]).toBeLessThan(data[edge] + 20);
    }
  });
});
