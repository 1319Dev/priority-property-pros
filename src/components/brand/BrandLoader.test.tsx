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
    expect(status.querySelector(".brand-loader-arc")).toBeTruthy();
    expect(status.querySelector(".brand-loader-swing")).toBeNull();
    expect(status.querySelector("p")?.className).toContain("text-ink-500");
  });

  it("uses the house tile on full-page and inline loaders", () => {
    expect(FULL_PAGE_LOADER).toBe("logo");

    const { unmount } = render(<BrandLoader layout="page" />);
    const page = screen.getByRole("status");
    expect(page.className).toContain("min-h-[70vh]");
    expect(page.querySelector("svg")).toHaveAttribute("width", "96");
    expect(page.querySelector(".brand-loader-arc circle")).toHaveAttribute("cx", "36");
    expect(page.querySelector(".brand-loader-arc circle")).toHaveAttribute("cy", "36");
    expect(page.querySelector("p")?.className).toContain("font-sans");
    unmount();

    render(<BrandLoader layout="inline" label="Loading…" />);
    const inline = screen.getByRole("status");
    expect(inline.className).toContain("flex-row");
    expect(inline.querySelector("svg")).toHaveAttribute("width", "28");
    expect(inline.querySelector(".brand-loader-arc")).toBeTruthy();
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
    expect(css).toMatch(/brand-loader-arc-spin 1\.2s linear infinite/);
    expect(css).not.toMatch(/brand-loader-tap/);
    expect(css).not.toMatch(/brand-loader-swing/);
    expect(css).toMatch(/prefers-reduced-motion:\s*reduce/);
    const reduced = css.slice(css.indexOf("prefers-reduced-motion"));
    expect(reduced).toMatch(/\.brand-loader-arc\s*,[\s\S]*animation:\s*none/);
  });
});
