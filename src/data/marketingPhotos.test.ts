import { readdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { joinWithBase } from "../utils/cn";
import {
  FEATURED_SERVICE_VISUALS,
  MARKETING_PHOTOS,
  createMarketingPhotos,
  marketingAssetUrl,
} from "./marketingPhotos";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const marketingDir = path.join(repoRoot, "public/images/marketing");
const HOUSE_JPG = "service-finished-exterior-1152w.jpg";

function srcSetUrls(srcSet: string): string[] {
  return srcSet.split(",").map((part) => part.trim().split(" ")[0] ?? "");
}

describe("marketing photo catalog", () => {
  it("ships only the finished house photo with srcset, dimensions, and alt text", () => {
    const ids = Object.keys(MARKETING_PHOTOS);
    expect(ids).toEqual(["house"]);
    const photo = MARKETING_PHOTOS.house;
    expect(photo.alt).toMatch(/finished suburban home/i);
    expect(photo.alt.length).toBeGreaterThan(20);
    expect(photo.width).toBeGreaterThan(0);
    expect(photo.height).toBeGreaterThan(0);
    expect(photo.src).toMatch(/service-finished-exterior-1152w\.jpg$/);
    expect(photo.sources.some((source) => source.type === "image/webp")).toBe(true);
    expect(photo.sources.some((source) => source.type === "image/jpeg")).toBe(true);
    expect(photo.sources.every((source) => source.srcSet.includes("w,"))).toBe(true);
    expect(FEATURED_SERVICE_VISUALS).toHaveLength(6);
    expect(FEATURED_SERVICE_VISUALS.every((item) => "accent" in item && !("photoId" in item))).toBe(true);
  });

  it("prefixes src and srcSet with the Vite base (GitHub Pages and site root)", () => {
    const viteBase = import.meta.env.BASE_URL;
    expect(MARKETING_PHOTOS.house.src).toBe(marketingAssetUrl(HOUSE_JPG));
    expect(MARKETING_PHOTOS.house.src.startsWith(viteBase)).toBe(true);
    expect(MARKETING_PHOTOS.house.src).not.toContain("//images/");
    for (const source of MARKETING_PHOTOS.house.sources) {
      for (const url of srcSetUrls(source.srcSet)) {
        expect(url.startsWith(viteBase)).toBe(true);
        expect(url).not.toContain("//images/");
      }
    }

    const pages = createMarketingPhotos("/priority-property-pros/");
    expect(pages.house.src).toBe("/priority-property-pros/images/marketing/service-finished-exterior-1152w.jpg");
    expect(pages.house.sources.flatMap((source) => srcSetUrls(source.srcSet))).toEqual(
      expect.arrayContaining([
        "/priority-property-pros/images/marketing/service-finished-exterior-480w.webp",
        "/priority-property-pros/images/marketing/service-finished-exterior-1152w.webp",
        "/priority-property-pros/images/marketing/service-finished-exterior-480w.jpg",
        "/priority-property-pros/images/marketing/service-finished-exterior-1152w.jpg",
      ]),
    );

    const root = createMarketingPhotos("/");
    expect(root.house.src).toBe("/images/marketing/service-finished-exterior-1152w.jpg");
    expect(srcSetUrls(root.house.sources[0].srcSet)[0]).toBe(
      "/images/marketing/service-finished-exterior-480w.webp",
    );
  });

  it("joins Vite base and public asset paths without double slashes", () => {
    expect(joinWithBase("/priority-property-pros/", "/images/marketing/service-finished-exterior-1152w.jpg")).toBe(
      "/priority-property-pros/images/marketing/service-finished-exterior-1152w.jpg",
    );
    expect(joinWithBase("/priority-property-pros", "images/marketing/service-finished-exterior-1152w.jpg")).toBe(
      "/priority-property-pros/images/marketing/service-finished-exterior-1152w.jpg",
    );
    expect(joinWithBase("/", "/images/marketing/service-finished-exterior-1152w.jpg")).toBe(
      "/images/marketing/service-finished-exterior-1152w.jpg",
    );
    expect(marketingAssetUrl(HOUSE_JPG, "/priority-property-pros/")).toBe(
      "/priority-property-pros/images/marketing/service-finished-exterior-1152w.jpg",
    );
    expect(marketingAssetUrl(HOUSE_JPG, "/")).toBe("/images/marketing/service-finished-exterior-1152w.jpg");
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
