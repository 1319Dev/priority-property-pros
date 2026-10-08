import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { BrandLoader } from "./BrandLoader";

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

  it("centers a large hammer on full-page loads and offers a small inline variant", () => {
    const { unmount } = render(<BrandLoader layout="page" />);
    const page = screen.getByRole("status");
    expect(page.className).toContain("min-h-[70vh]");
    expect(page.querySelector("svg")).toHaveAttribute("width", "96");
    expect(page.querySelector("p")?.className).toContain("font-sans");
    unmount();

    render(<BrandLoader layout="inline" label="Loading…" />);
    const inline = screen.getByRole("status");
    expect(inline.className).toContain("flex-row");
    expect(inline.querySelector("svg")).toHaveAttribute("width", "28");
  });

  it("holds the hammer still when motion is reduced", () => {
    expect(css).toMatch(/@keyframes brand-loader-tap/);
    expect(css).toMatch(/brand-loader-tap 1\.25s/);
    expect(css).toMatch(/transform-origin:\s*56\.25% 90%/);
    expect(css).toMatch(/prefers-reduced-motion:\s*reduce/);
    const reduced = css.slice(css.indexOf("prefers-reduced-motion"));
    expect(reduced).toMatch(/\.brand-loader-swing\s*\{[^}]*animation:\s*none/);
    expect(reduced).toMatch(/brand-loader-pulse/);
  });
});
