import { joinWithBase } from "../utils/cn";

export type MarketingPhotoId = "house" | "ranch" | "twoStory" | "porch" | "landscaped" | "dusk";

export type MarketingPhotoSource = {
  type: "image/webp" | "image/jpeg";
  srcSet: string;
};

export type MarketingPhotoAsset = {
  id: MarketingPhotoId;
  alt: string;
  width: number;
  height: number;
  objectPosition: string;
  src: string;
  sources: MarketingPhotoSource[];
  defaultSizes: string;
};

const MARKETING_DIR = "images/marketing";
const PHOTO_WIDTHS = [480, 640, 768, 960, 1152] as const;

const PHOTO_FILES: Record<MarketingPhotoId, string> = {
  house: "service-finished-exterior",
  ranch: "service-ranch-exterior",
  twoStory: "service-two-story-exterior",
  porch: "service-porch-exterior",
  landscaped: "service-landscaped-yard",
  dusk: "service-dusk-exterior",
};

/** Distinct exteriors for each public marketing surface — never reuse the hero crop. */
export const MARKETING_SECTION_PHOTOS = {
  homepageHero: "house",
  homepageFindAProPreview: "ranch",
  homepageHowItWorks: "landscaped",
  findAProHeader: "twoStory",
  howItWorks: "porch",
  becomeAPro: "dusk",
} as const satisfies Record<string, MarketingPhotoId>;

export function marketingAssetUrl(filename: string, baseUrl: string = import.meta.env.BASE_URL): string {
  return joinWithBase(baseUrl, `${MARKETING_DIR}/${filename}`);
}

function variants(file: string, ext: "webp" | "jpg", baseUrl: string = import.meta.env.BASE_URL): string {
  return PHOTO_WIDTHS.map((width) => `${marketingAssetUrl(`${file}-${width}w.${ext}`, baseUrl)} ${width}w`).join(", ");
}

function photoAsset(
  id: MarketingPhotoId,
  alt: string,
  objectPosition: string,
  baseUrl: string,
): MarketingPhotoAsset {
  const file = PHOTO_FILES[id];
  return {
    id,
    alt,
    width: 1152,
    height: 864,
    objectPosition,
    src: marketingAssetUrl(`${file}-1152w.jpg`, baseUrl),
    sources: [
      { type: "image/webp", srcSet: variants(file, "webp", baseUrl) },
      { type: "image/jpeg", srcSet: variants(file, "jpg", baseUrl) },
    ],
    defaultSizes: "(max-width: 1024px) 100vw, 720px",
  };
}

export function createMarketingPhotos(
  baseUrl: string = import.meta.env.BASE_URL,
): Record<MarketingPhotoId, MarketingPhotoAsset> {
  return {
    house: photoAsset(
      "house",
      "A finished suburban home with new landscaping, a clean driveway, and a cedar privacy fence.",
      "center 40%",
      baseUrl,
    ),
    ranch: photoAsset(
      "ranch",
      "A finished cream-and-stone ranch home with a brick walkway, fresh sod, and new foundation plantings.",
      "center 45%",
      baseUrl,
    ),
    twoStory: photoAsset(
      "twoStory",
      "A finished two-story brick-and-siding home with a stone walkway, flowering shrubs, and a tidy front lawn.",
      "center 40%",
      baseUrl,
    ),
    porch: photoAsset(
      "porch",
      "A finished craftsman bungalow with a deep front porch, hanging baskets, and lush hydrangea beds.",
      "center 50%",
      baseUrl,
    ),
    landscaped: photoAsset(
      "landscaped",
      "A professionally landscaped front yard with a paver walkway, ornamental grasses, and a Japanese maple.",
      "center 55%",
      baseUrl,
    ),
    dusk: photoAsset(
      "dusk",
      "A finished navy two-story home at dusk with warm interior lights and a lit brick walkway.",
      "center 40%",
      baseUrl,
    ),
  };
}

export const MARKETING_PHOTOS: Record<MarketingPhotoId, MarketingPhotoAsset> = createMarketingPhotos();

export const FEATURED_SERVICE_VISUALS = [
  {
    id: "fence",
    title: "Fencing",
    blurb: "Privacy fence, repairs, gates — local independents, not a national dispatch desk.",
    serviceName: "Fence Repair",
    accent: "bg-forest-800",
  },
  {
    id: "landscaping",
    title: "Lawn & landscape",
    blurb: "Mow, beds, and property tidy-ups for homes and small commercial lots.",
    serviceName: "Lawn Care",
    accent: "bg-forest-700",
  },
  {
    id: "handyman",
    title: "Handyman & remodel",
    blurb: "Interior fixes, trim, mounting, and small remodels done by a local pro.",
    serviceName: "Handyman",
    accent: "bg-forest-800",
  },
  {
    id: "plumbing",
    title: "Plumbing",
    blurb: "Residential and light-commercial fixture work posted in plain language.",
    serviceName: "Other",
    accent: "bg-forest-700",
  },
  {
    id: "electrical",
    title: "Electrical & HVAC",
    blurb: "Serious trade work. Post the job and let approved locals compete fairly.",
    serviceName: "General Property Maintenance",
    accent: "bg-forest-800",
  },
  {
    id: "finished",
    title: "Finished projects",
    blurb: "From curb appeal to upkeep — find the right local professional for the property.",
    serviceName: "General Property Maintenance",
    accent: "bg-forest-950",
  },
] as const;
