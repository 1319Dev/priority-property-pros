import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { BrandLoader, FULL_PAGE_LOADER, LoaderSlot } from "./BrandLoader";

const css = readFileSync(path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../index.css"), "utf8");

describe("BrandLoader", () => {
  it("announces Loading and keeps a fixed box", () => {
    render(<BrandLoader />);
    const status = screen.getByRole("status");
    expect(status).toHaveAttribute("aria-live", "polite");
    expect(status).toHaveAccessibleName("Loading…");
    expect(status).toHaveTextContent("Loading…");
    expect(status.className).toContain("min-h-36");
    expect(status.querySelector("svg")).toBeTruthy();
    expect(status.querySelector(".brand-loader-swing")).toBeTruthy();
    expect(status.querySelector(".brand-loader-impact")).toBeTruthy();
    expect(status.querySelector("p")?.className).toContain("text-ink-500");
  });

  it("centers a large hammer on full-page loads and uses the house mark inline", () => {
    const { unmount } = render(<BrandLoader layout="page" />);
    const page = screen.getByRole("status");
    expect(page.className).toContain("min-h-[70vh]");
    expect(page.querySelector("svg")).toHaveAttribute("width", "96");
    expect(FULL_PAGE_LOADER).toBe("hammer");
    expect(page.querySelector(".brand-loader-swing")).toBeTruthy();
    expect(page.querySelector("p")?.className).toContain("font-sans");
    unmount();

    render(<BrandLoader layout="inline" label="Loading…" />);
    const inline = screen.getByRole("status");
    expect(inline.className).toContain("flex-row");
    expect(inline.querySelector("svg")).toHaveAttribute("width", "28");
    expect(inline.querySelector(".brand-loader-arc")).toBeTruthy();
    expect(inline.querySelector(".brand-loader-swing")).toBeNull();
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

  it("holds the hammer still when motion is reduced", () => {
    expect(css).toMatch(/@keyframes brand-loader-tap/);
    expect(css).toMatch(/brand-loader-tap 1\.1s/);
    expect(css).toMatch(/transform-origin:\s*59\.375% 88\.59%/);
    expect(css).toMatch(/prefers-reduced-motion:\s*reduce/);
    const reduced = css.slice(css.indexOf("prefers-reduced-motion"));
    expect(reduced).toMatch(/\.brand-loader-swing\s*\{[^}]*animation:\s*none/);
    expect(reduced).toMatch(/brand-loader-pulse/);
  });
});
