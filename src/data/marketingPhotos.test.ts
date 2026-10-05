import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { joinWithBase } from "../utils/cn";
import { SERVICES } from "./services";
import {
  MARKETING_PHOTOS,
  MARKETING_SECTION_PHOTOS,
  OFFICIAL_CATEGORY_CARDS,
  STOCK_CONTRACTOR_FACE_SHIPPED,
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
  "homeowners",
  "contractorDrill",
  "categoryKitchen",
  "categoryBathroom",
  "categoryDecks",
  "categoryRoofing",
  "categoryHvac",
  "categoryPainting",
  "categoryLandscaping",
  "categoryHandyman",
  "portfolioDeck",
  "trustCouple",
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
      expect(photo.src).toMatch(new RegExp(`-${photo.width}w\\.jpg$`));
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
    expect(MARKETING_PHOTOS.homeowners.alt).toMatch(/homeowners/i);
    expect(MARKETING_PHOTOS.homeowners.alt).not.toMatch(/find trusted|post a project|verified pros/i);
    expect(MARKETING_PHOTOS.contractorDrill.alt).toMatch(/drill/i);
    expect(MARKETING_PHOTOS.portfolioDeck.alt).toMatch(/not a contractor/i);
    expect(MARKETING_PHOTOS.trustCouple.alt).toMatch(/not identified as Priority Property Pros customers/i);
    expect(OFFICIAL_CATEGORY_CARDS).toHaveLength(8);
    expect(STOCK_CONTRACTOR_FACE_SHIPPED).toBe(false);
  });

  it("maps official category photos onto catalog services only when those names exist", () => {
    const names = new Set(SERVICES.map((service) => service.name));
    expect(OFFICIAL_CATEGORY_CARDS.map((card) => card.photoId)).toEqual([
      "categoryKitchen",
      "categoryBathroom",
      "categoryDecks",
      "categoryRoofing",
      "categoryHvac",
      "categoryPainting",
      "categoryLandscaping",
      "categoryHandyman",
    ]);
    for (const card of OFFICIAL_CATEGORY_CARDS) {
      if (card.serviceName) expect(names.has(card.serviceName)).toBe(true);
    }
    expect(OFFICIAL_CATEGORY_CARDS.find((card) => card.id === "painting")?.serviceName).toBe("Painting");
    expect(OFFICIAL_CATEGORY_CARDS.find((card) => card.id === "landscaping")?.serviceName).toBe("Landscaping");
    expect(OFFICIAL_CATEGORY_CARDS.find((card) => card.id === "handyman")?.serviceName).toBe("Handyman");
    expect(OFFICIAL_CATEGORY_CARDS.find((card) => card.id === "decks")?.serviceName).toBe("Deck Repair");
    expect(OFFICIAL_CATEGORY_CARDS.find((card) => card.id === "hvac")?.serviceName).toBeNull();
    expect(OFFICIAL_CATEGORY_CARDS.find((card) => card.id === "kitchen")?.serviceName).toBeNull();
  });

  it("assigns the homepage banner to the official homeowners photo", () => {
    expect(MARKETING_SECTION_PHOTOS.homepageHeroBanner).toBe("homeowners");
    expect(MARKETING_SECTION_PHOTOS.homepageHeroBanner).not.toBe("brandHero");
    expect(MARKETING_SECTION_PHOTOS.homepageHeroBanner).not.toBe("ranch");
    expect(MARKETING_SECTION_PHOTOS.becomeAPro).toBe("contractorDrill");
    expect(MARKETING_SECTION_PHOTOS.contractorMarketing).toBe("contractorDrill");
    expect(MARKETING_SECTION_PHOTOS.portfolioExample).toBe("portfolioDeck");
    expect(MARKETING_SECTION_PHOTOS.trustLifestyle).toBe("trustCouple");
    expect(MARKETING_SECTION_PHOTOS.homepageFindAProPreview).toBe("twoStory");
    expect(MARKETING_SECTION_PHOTOS.findAProHeader).toBe("twoStory");
    expect(MARKETING_SECTION_PHOTOS.howItWorks).toBe("porch");
    expect(MARKETING_SECTION_PHOTOS.homepageHowItWorks).toBe("landscaped");

    const files = {
      hero: readFileSync(path.join(repoRoot, "src/features/home/Hero.tsx"), "utf8"),
      banner: readFileSync(path.join(repoRoot, "src/features/home/HeroBanner.tsx"), "utf8"),
      browse: readFileSync(path.join(repoRoot, "src/features/browse/BrowseVisuals.tsx"), "utf8"),
      homeHow: readFileSync(path.join(repoRoot, "src/features/home/HowItWorks.tsx"), "utf8"),
      find: readFileSync(path.join(repoRoot, "src/pages/FindAProPage.tsx"), "utf8"),
      directory: readFileSync(path.join(repoRoot, "src/features/findAPro/FindAProDirectory.tsx"), "utf8"),
      storefront: readFileSync(path.join(repoRoot, "src/features/findAPro/ContractorStorefront.tsx"), "utf8"),
      how: readFileSync(path.join(repoRoot, "src/pages/HowItWorksPage.tsx"), "utf8"),
      become: readFileSync(path.join(repoRoot, "src/pages/BecomeAProPage.tsx"), "utf8"),
      visuals: readFileSync(path.join(repoRoot, "src/features/home/ServiceVisuals.tsx"), "utf8"),
      contractors: readFileSync(path.join(repoRoot, "src/features/home/ForContractors.tsx"), "utf8"),
      trust: readFileSync(path.join(repoRoot, "src/features/home/TrustSafety.tsx"), "utf8"),
    };
    expect(files.hero).toContain("HeroBanner");
    expect(files.hero).toContain("TrustMarkList");
    expect(files.hero).not.toContain("homepageHero");
    expect(files.banner).toContain("MARKETING_SECTION_PHOTOS.homepageHeroBanner");
    expect(files.browse).toContain("MARKETING_SECTION_PHOTOS.homepageFindAProPreview");
    expect(files.homeHow).toContain("MARKETING_SECTION_PHOTOS.homepageHowItWorks");
    expect(files.find).toContain("MARKETING_SECTION_PHOTOS.findAProHeader");
    expect(files.find).not.toContain("photoUrl");
    expect(files.find).not.toContain("PortfolioExample");
    expect(files.directory).toContain("<ContractorAvatar size={56} />");
    expect(files.directory).not.toContain("photoUrl");
    expect(files.directory).not.toContain("PortfolioExample");
    expect(files.storefront).toContain("<ContractorAvatar size={64} />");
    expect(files.storefront).not.toContain("photoUrl");
    expect(files.storefront).not.toContain("PortfolioExample");
    expect(files.how).toContain("MARKETING_SECTION_PHOTOS.howItWorks");
    expect(files.become).toContain("MARKETING_SECTION_PHOTOS.becomeAPro");
    expect(files.visuals).toContain("OFFICIAL_CATEGORY_CARDS");
    expect(files.contractors).toContain("MARKETING_SECTION_PHOTOS.contractorMarketing");
    expect(files.trust).toContain("MARKETING_SECTION_PHOTOS.trustLifestyle");
    expect(files.trust).toContain("TrustMarkList");
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
    expect(root.homeowners.src).toBe("/images/marketing/official-hero-homeowners-650w.jpg");
    expect(root.contractorDrill.src).toBe("/images/marketing/official-contractor-drill-467w.jpg");
    expect(srcSetUrls(root.categoryPainting.sources[0].srcSet)).toEqual([
      "/images/marketing/official-category-painting-120w.webp",
      "/images/marketing/official-category-painting-186w.webp",
    ]);
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

  it("does not ship the stock contractor face as an identity photo", () => {
    const files = readdirSync(marketingDir);
    expect(files.some((file) => /van|beard|pro-card|find-a-pro-card/i.test(file))).toBe(false);
    const src = readFileSync(path.join(repoRoot, "src/components/media/ContractorAvatar.tsx"), "utf8");
    expect(src).toContain("CONTRACTOR_PLACEHOLDER_LABEL");
    expect(src).not.toMatch(/official-pro-van|bearded/i);
    const portfolio = readFileSync(path.join(repoRoot, "src/components/media/PortfolioExample.tsx"), "utf8");
    expect(portfolio).toContain("not added to your portfolio");
    expect(portfolio).toContain("portfolioExample");
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
