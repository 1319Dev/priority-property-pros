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
  });

  it("holds the hammer still when motion is reduced", () => {
    expect(css).toMatch(/@keyframes brand-loader-tap/);
    expect(css).toMatch(/prefers-reduced-motion:\s*reduce/);
    const reduced = css.slice(css.indexOf("prefers-reduced-motion"));
    expect(reduced).toMatch(/\.brand-loader-swing\s*\{[^}]*animation:\s*none/);
  });
});
