import { readdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { FEATURED_SERVICE_VISUALS, MARKETING_PHOTOS } from "./marketingPhotos";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const marketingDir = path.join(repoRoot, "public/images/marketing");

describe("marketing photo catalog", () => {
  it("ships seven licensed photos with srcset, dimensions, and alt text", () => {
    const ids = Object.keys(MARKETING_PHOTOS);
    expect(ids).toHaveLength(7);
    for (const photo of Object.values(MARKETING_PHOTOS)) {
      expect(photo.alt.length).toBeGreaterThan(20);
      expect(photo.width).toBeGreaterThan(0);
      expect(photo.height).toBeGreaterThan(0);
      expect(photo.src).toMatch(/\.jpg$/);
      expect(photo.sources.some((source) => source.type === "image/webp")).toBe(true);
      expect(photo.sources.some((source) => source.type === "image/jpeg")).toBe(true);
      expect(photo.sources.every((source) => source.srcSet.includes("w,"))).toBe(true);
    }
    expect(FEATURED_SERVICE_VISUALS).toHaveLength(6);
  });

  it("has compressed web and jpeg derivatives on disk for every listed source", () => {
    const files = new Set(readdirSync(marketingDir));
    for (const photo of Object.values(MARKETING_PHOTOS)) {
      for (const source of photo.sources) {
        for (const part of source.srcSet.split(",")) {
          const file = path.basename(part.trim().split(" ")[0] ?? "");
          expect(files.has(file), `missing ${file}`).toBe(true);
        }
      }
      expect(files.has(path.basename(photo.src))).toBe(true);
    }
  });
});
