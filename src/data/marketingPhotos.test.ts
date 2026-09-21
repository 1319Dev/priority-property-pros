import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { joinWithBase } from "../utils/cn";
import {
  FEATURED_SERVICE_VISUALS,
  MARKETING_PHOTOS,
  MARKETING_SECTION_PHOTOS,
  createMarketingPhotos,
  marketingAssetUrl,
  type MarketingPhotoId,
} from "./marketingPhotos";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const marketingDir = path.join(repoRoot, "public/images/marketing");
const HOUSE_JPG = "service-finished-exterior-1152w.jpg";
const BRAND_HERO_JPG = "brand-hero-from-need-to-done-1152w.jpg";
const EXPECTED_IDS: MarketingPhotoId[] = [
  "brandHero",
  "house",
  "ranch",
  "twoStory",
  "porch",
  "landscaped",
  "dusk",
];

function srcSetUrls(srcSet: string): string[] {
  return srcSet.split(",").map((part) => part.trim().split(" ")[0] ?? "");
}

describe("marketing photo catalog", () => {
  it("ships distinct finished-exterior photos with srcset, dimensions, and alt text", () => {
    const ids = Object.keys(MARKETING_PHOTOS);
    expect(ids).toEqual(EXPECTED_IDS);
    expect(new Set(Object.values(MARKETING_PHOTOS).map((photo) => photo.src)).size).toBe(EXPECTED_IDS.length);

    for (const id of EXPECTED_IDS) {
      const photo = MARKETING_PHOTOS[id];
      expect(photo.alt.length).toBeGreaterThan(20);
      expect(photo.width).toBeGreaterThan(0);
      expect(photo.height).toBeGreaterThan(0);
      expect(photo.src).toMatch(/-1152w\.jpg$/);
      expect(photo.sources.some((source) => source.type === "image/webp")).toBe(true);
      expect(photo.sources.some((source) => source.type === "image/jpeg")).toBe(true);
      expect(photo.sources.every((source) => source.srcSet.includes("w,"))).toBe(true);
    }

    expect(MARKETING_PHOTOS.brandHero.alt).toMatch(/from need to done/i);
    expect(MARKETING_PHOTOS.brandHero.objectFit).toBe("contain");
    expect(MARKETING_PHOTOS.brandHero.height).toBe(768);
    expect(MARKETING_PHOTOS.house.alt).toMatch(/finished suburban home/i);
    expect(MARKETING_PHOTOS.house.objectFit).toBe("cover");
    expect(MARKETING_PHOTOS.ranch.alt).toMatch(/ranch/i);
    expect(MARKETING_PHOTOS.twoStory.alt).toMatch(/two-story/i);
    expect(MARKETING_PHOTOS.porch.alt).toMatch(/porch/i);
    expect(MARKETING_PHOTOS.landscaped.alt).toMatch(/landscaped/i);
    expect(MARKETING_PHOTOS.dusk.alt).toMatch(/dusk/i);
    expect(FEATURED_SERVICE_VISUALS).toHaveLength(6);
    expect(FEATURED_SERVICE_VISUALS.every((item) => "accent" in item && !("photoId" in item))).toBe(true);
  });

  it("assigns the homepage banner to the ranch exterior and does not reuse that crop", () => {
    const assigned = Object.values(MARKETING_SECTION_PHOTOS);
    expect(assigned).toEqual(["ranch", "house", "twoStory", "landscaped", "twoStory", "porch", "dusk"]);
    expect(MARKETING_SECTION_PHOTOS.homepageHeroBanner).toBe("ranch");
    expect(MARKETING_SECTION_PHOTOS.homepageHeroBanner).not.toBe("brandHero");
    expect(assigned.filter((id) => id === MARKETING_SECTION_PHOTOS.homepageHeroBanner)).toHaveLength(1);
    expect(assigned.filter((id) => id === "house")).toHaveLength(1);
    expect(MARKETING_SECTION_PHOTOS.homepageHero).toBe("house");
    expect(MARKETING_SECTION_PHOTOS.homepageFindAProPreview).toBe("twoStory");
    expect(MARKETING_SECTION_PHOTOS.homepageHero).not.toBe(MARKETING_SECTION_PHOTOS.howItWorks);
    expect(MARKETING_SECTION_PHOTOS.homepageHero).not.toBe(MARKETING_SECTION_PHOTOS.becomeAPro);
    expect(MARKETING_SECTION_PHOTOS.homepageHero).not.toBe(MARKETING_SECTION_PHOTOS.findAProHeader);
    expect(MARKETING_SECTION_PHOTOS.homepageHeroBanner).not.toBe(MARKETING_SECTION_PHOTOS.homepageHero);

    const files = {
      hero: readFileSync(path.join(repoRoot, "src/features/home/Hero.tsx"), "utf8"),
      banner: readFileSync(path.join(repoRoot, "src/features/home/HeroBanner.tsx"), "utf8"),
      browse: readFileSync(path.join(repoRoot, "src/features/browse/BrowseVisuals.tsx"), "utf8"),
      homeHow: readFileSync(path.join(repoRoot, "src/features/home/HowItWorks.tsx"), "utf8"),
      find: readFileSync(path.join(repoRoot, "src/pages/FindAProPage.tsx"), "utf8"),
      how: readFileSync(path.join(repoRoot, "src/pages/HowItWorksPage.tsx"), "utf8"),
      become: readFileSync(path.join(repoRoot, "src/pages/BecomeAProPage.tsx"), "utf8"),
    };
    expect(files.hero).toContain("HeroBanner");
    expect(files.hero).toContain("MARKETING_SECTION_PHOTOS.homepageHero");
    expect(files.banner).toContain("MARKETING_SECTION_PHOTOS.homepageHeroBanner");
    expect(files.browse).toContain("MARKETING_SECTION_PHOTOS.homepageFindAProPreview");
    expect(files.homeHow).toContain("MARKETING_SECTION_PHOTOS.homepageHowItWorks");
    expect(files.find).toContain("MARKETING_SECTION_PHOTOS.findAProHeader");
    expect(files.how).toContain("MARKETING_SECTION_PHOTOS.howItWorks");
    expect(files.become).toContain("MARKETING_SECTION_PHOTOS.becomeAPro");
  });

  it("prefixes src and srcSet with the Vite base (GitHub Pages and site root)", () => {
    const viteBase = import.meta.env.BASE_URL;
    expect(MARKETING_PHOTOS.house.src).toBe(marketingAssetUrl(HOUSE_JPG));
    expect(MARKETING_PHOTOS.brandHero.src).toBe(marketingAssetUrl(BRAND_HERO_JPG));
    expect(MARKETING_PHOTOS.house.src.startsWith(viteBase)).toBe(true);
    expect(MARKETING_PHOTOS.house.src).not.toContain("//images/");
    for (const photo of Object.values(MARKETING_PHOTOS)) {
      expect(photo.src.startsWith(viteBase)).toBe(true);
      expect(photo.src).not.toContain("//images/");
      for (const source of photo.sources) {
        for (const url of srcSetUrls(source.srcSet)) {
          expect(url.startsWith(viteBase)).toBe(true);
          expect(url).not.toContain("//images/");
        }
      }
    }

    const pages = createMarketingPhotos("/priority-property-pros/");
    expect(pages.brandHero.src).toBe(
      "/priority-property-pros/images/marketing/brand-hero-from-need-to-done-1152w.jpg",
    );
    expect(pages.house.src).toBe("/priority-property-pros/images/marketing/service-finished-exterior-1152w.jpg");
    expect(pages.ranch.src).toBe("/priority-property-pros/images/marketing/service-ranch-exterior-1152w.jpg");
    expect(pages.house.sources.flatMap((source) => srcSetUrls(source.srcSet))).toEqual(
      expect.arrayContaining([
        "/priority-property-pros/images/marketing/service-finished-exterior-480w.webp",
        "/priority-property-pros/images/marketing/service-finished-exterior-1152w.webp",
        "/priority-property-pros/images/marketing/service-finished-exterior-480w.jpg",
        "/priority-property-pros/images/marketing/service-finished-exterior-1152w.jpg",
      ]),
    );

    const root = createMarketingPhotos("/");
    expect(root.brandHero.src).toBe("/images/marketing/brand-hero-from-need-to-done-1152w.jpg");
    expect(root.house.src).toBe("/images/marketing/service-finished-exterior-1152w.jpg");
    expect(root.dusk.src).toBe("/images/marketing/service-dusk-exterior-1152w.jpg");
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
    expect(marketingAssetUrl(BRAND_HERO_JPG, "/")).toBe("/images/marketing/brand-hero-from-need-to-done-1152w.jpg");
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
