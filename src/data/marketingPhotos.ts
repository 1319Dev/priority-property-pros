export type MarketingPhotoId =
  | "hero"
  | "fence"
  | "landscaping"
  | "handyman"
  | "plumbing"
  | "electrical"
  | "finished";

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

const MARKETING_DIR = "/images/marketing";

function variants(id: string, widths: readonly number[], ext: "webp" | "jpg"): string {
  return widths.map((width) => `${MARKETING_DIR}/${id}-${width}w.${ext} ${width}w`).join(", ");
}

function photo(input: {
  id: MarketingPhotoId;
  fileId: string;
  alt: string;
  width: number;
  height: number;
  objectPosition: string;
  widths: readonly number[];
  defaultSizes: string;
}): MarketingPhotoAsset {
  const fallbackWidth = input.widths[input.widths.length - 1];
  return {
    id: input.id,
    alt: input.alt,
    width: input.width,
    height: input.height,
    objectPosition: input.objectPosition,
    src: `${MARKETING_DIR}/${input.fileId}-${fallbackWidth}w.jpg`,
    sources: [
      { type: "image/webp", srcSet: variants(input.fileId, input.widths, "webp") },
      { type: "image/jpeg", srcSet: variants(input.fileId, input.widths, "jpg") },
    ],
    defaultSizes: input.defaultSizes,
  };
}

const HERO_WIDTHS = [640, 960, 1280] as const;
const CARD_WIDTHS = [480, 768, 1152] as const;
const HERO_SIZES = "(max-width: 640px) 100vw, (max-width: 1024px) 100vw, 1280px";
const CARD_SIZES = "(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 420px";
const FEATURE_SIZES = "(max-width: 1024px) 100vw, 560px";

export const MARKETING_PHOTOS: Record<MarketingPhotoId, MarketingPhotoAsset> = {
  hero: photo({
    id: "hero",
    fileId: "hero-contractor",
    alt: "A property owner and a local professional stand on a front walk, looking toward a well-kept house and privacy fence.",
    width: 1280,
    height: 720,
    objectPosition: "center 40%",
    widths: HERO_WIDTHS,
    defaultSizes: HERO_SIZES,
  }),
  fence: photo({
    id: "fence",
    fileId: "service-fence",
    alt: "A fencing contractor kneels to fasten a mid-build cedar fence, with a post set in concrete and boards going on the rails.",
    width: 1152,
    height: 864,
    objectPosition: "center 45%",
    widths: CARD_WIDTHS,
    defaultSizes: CARD_SIZES,
  }),
  landscaping: photo({
    id: "landscaping",
    fileId: "service-landscaping",
    alt: "A lawn professional rakes hardwood mulch in a foundation bed beside a loaded wheelbarrow.",
    width: 1152,
    height: 864,
    objectPosition: "center 40%",
    widths: CARD_WIDTHS,
    defaultSizes: CARD_SIZES,
  }),
  handyman: photo({
    id: "handyman",
    fileId: "service-handyman",
    alt: "A handyman kneels and presses a finish nailer into primed baseboard, with a tape measure on the floor.",
    width: 1152,
    height: 864,
    objectPosition: "center 45%",
    widths: CARD_WIDTHS,
    defaultSizes: CARD_SIZES,
  }),
  plumbing: photo({
    id: "plumbing",
    fileId: "service-plumbing",
    alt: "A plumber tightens a PVC P-trap slip nut with channel-lock pliers under a kitchen sink.",
    width: 1152,
    height: 864,
    objectPosition: "center 45%",
    widths: CARD_WIDTHS,
    defaultSizes: CARD_SIZES,
  }),
  electrical: photo({
    id: "electrical",
    fileId: "service-electrical",
    alt: "An electrician in safety glasses mounts a standard duplex receptacle in a single-gang wall box.",
    width: 1152,
    height: 864,
    objectPosition: "center 40%",
    widths: CARD_WIDTHS,
    defaultSizes: CARD_SIZES,
  }),
  finished: photo({
    id: "finished",
    fileId: "service-finished-exterior",
    alt: "A finished suburban home with new landscaping, a clean driveway, and a cedar privacy fence.",
    width: 1152,
    height: 864,
    objectPosition: "center 45%",
    widths: CARD_WIDTHS,
    defaultSizes: FEATURE_SIZES,
  }),
};

export const FEATURED_SERVICE_VISUALS = [
  {
    id: "fence",
    photoId: "fence" as const,
    title: "Fencing",
    blurb: "Privacy fence, repairs, gates — local independents, not a national dispatch desk.",
    serviceName: "Fence Repair",
  },
  {
    id: "landscaping",
    photoId: "landscaping" as const,
    title: "Lawn & landscape",
    blurb: "Mow, beds, and property tidy-ups for homes and small commercial lots.",
    serviceName: "Lawn Care",
  },
  {
    id: "handyman",
    photoId: "handyman" as const,
    title: "Handyman & remodel",
    blurb: "Interior fixes, trim, mounting, and small remodels done by a local pro.",
    serviceName: "Handyman",
  },
  {
    id: "plumbing",
    photoId: "plumbing" as const,
    title: "Plumbing",
    blurb: "Residential and light-commercial fixture work posted in plain language.",
    serviceName: "Other",
  },
  {
    id: "electrical",
    photoId: "electrical" as const,
    title: "Electrical & HVAC",
    blurb: "Serious trade work. Post the job and let approved locals compete fairly.",
    serviceName: "General Property Maintenance",
  },
  {
    id: "finished",
    photoId: "finished" as const,
    title: "Finished projects",
    blurb: "From curb appeal to upkeep — find the right local professional for the property.",
    serviceName: "General Property Maintenance",
  },
] as const;
