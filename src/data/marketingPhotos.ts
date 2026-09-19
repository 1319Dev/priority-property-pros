import { joinWithBase } from "../utils/cn";

export type MarketingPhotoId = "house";

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
const HOUSE_FILE = "service-finished-exterior";
const HOUSE_WIDTHS = [480, 640, 768, 960, 1152] as const;

export function marketingAssetUrl(filename: string, baseUrl: string = import.meta.env.BASE_URL): string {
  return joinWithBase(baseUrl, `${MARKETING_DIR}/${filename}`);
}

function variants(ext: "webp" | "jpg", baseUrl: string = import.meta.env.BASE_URL): string {
  return HOUSE_WIDTHS.map((width) => `${marketingAssetUrl(`${HOUSE_FILE}-${width}w.${ext}`, baseUrl)} ${width}w`).join(
    ", ",
  );
}

export function createMarketingPhotos(
  baseUrl: string = import.meta.env.BASE_URL,
): Record<MarketingPhotoId, MarketingPhotoAsset> {
  return {
    house: {
      id: "house",
      alt: "A finished suburban home with new landscaping, a clean driveway, and a cedar privacy fence.",
      width: 1152,
      height: 864,
      objectPosition: "center 45%",
      src: marketingAssetUrl(`${HOUSE_FILE}-1152w.jpg`, baseUrl),
      sources: [
        { type: "image/webp", srcSet: variants("webp", baseUrl) },
        { type: "image/jpeg", srcSet: variants("jpg", baseUrl) },
      ],
      defaultSizes: "(max-width: 1024px) 100vw, 720px",
    },
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
