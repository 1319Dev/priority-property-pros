import { joinWithBase } from "../utils/cn";

export type MarketingPhotoId =
  | "brandHero"
  | "house"
  | "ranch"
  | "twoStory"
  | "porch"
  | "landscaped"
  | "dusk"
  | "homeowners"
  | "contractorDrill"
  | "categoryKitchen"
  | "categoryBathroom"
  | "categoryDecks"
  | "categoryRoofing"
  | "categoryHvac"
  | "categoryPainting"
  | "categoryLandscaping"
  | "categoryHandyman"
  | "portfolioDeck"
  | "trustCouple";

export type MarketingPhotoFit = "cover" | "contain";

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
  objectFit: MarketingPhotoFit;
  src: string;
  sources: MarketingPhotoSource[];
  defaultSizes: string;
};

const MARKETING_DIR = "images/marketing";
const PHOTO_WIDTHS = [480, 640, 768, 960, 1152] as const;

const PHOTO_FILES: Record<MarketingPhotoId, { file: string; widths: readonly number[] }> = {
  brandHero: { file: "brand-hero-from-need-to-done", widths: PHOTO_WIDTHS },
  house: { file: "service-finished-exterior", widths: PHOTO_WIDTHS },
  ranch: { file: "service-ranch-exterior", widths: PHOTO_WIDTHS },
  twoStory: { file: "service-two-story-exterior", widths: PHOTO_WIDTHS },
  porch: { file: "service-porch-exterior", widths: PHOTO_WIDTHS },
  landscaped: { file: "service-landscaped-yard", widths: PHOTO_WIDTHS },
  dusk: { file: "service-dusk-exterior", widths: PHOTO_WIDTHS },
  homeowners: { file: "official-hero-homeowners", widths: [320, 480, 640, 650] },
  contractorDrill: { file: "official-contractor-drill", widths: [240, 360, 467] },
  categoryKitchen: { file: "official-category-kitchen", widths: [120, 188] },
  categoryBathroom: { file: "official-category-bathroom", widths: [120, 195] },
  categoryDecks: { file: "official-category-decks", widths: [120, 196] },
  categoryRoofing: { file: "official-category-roofing", widths: [120, 194] },
  categoryHvac: { file: "official-category-hvac", widths: [120, 191] },
  categoryPainting: { file: "official-category-painting", widths: [120, 186] },
  categoryLandscaping: { file: "official-category-landscaping", widths: [120, 198] },
  categoryHandyman: { file: "official-category-handyman", widths: [120, 194] },
  portfolioDeck: { file: "official-portfolio-deck", widths: [240, 360, 455] },
  trustCouple: { file: "official-trust-couple", widths: [240, 322] },
};

/** The sheet's bearded contractor-with-van portrait is not shipped. It is not a PPP contractor. */
export const STOCK_CONTRACTOR_FACE_SHIPPED = false;

/**
 * Public marketing surfaces. The homepage banner crop stays unique —
 * do not reuse it on another section.
 */
export const MARKETING_SECTION_PHOTOS = {
  homepageHeroBanner: "homeowners",
  homepageFindAProPreview: "twoStory",
  homepageHowItWorks: "landscaped",
  findAProHeader: "twoStory",
  howItWorks: "porch",
  becomeAPro: "contractorDrill",
  contractorMarketing: "contractorDrill",
  portfolioExample: "portfolioDeck",
  trustLifestyle: "trustCouple",
} as const satisfies Record<string, MarketingPhotoId>;

export function marketingAssetUrl(filename: string, baseUrl: string = import.meta.env.BASE_URL): string {
  return joinWithBase(baseUrl, `${MARKETING_DIR}/${filename}`);
}

function variants(
  file: string,
  ext: "webp" | "jpg",
  widths: readonly number[],
  baseUrl: string = import.meta.env.BASE_URL,
): string {
  return widths.map((width) => `${marketingAssetUrl(`${file}-${width}w.${ext}`, baseUrl)} ${width}w`).join(", ");
}

function photoAsset(
  id: MarketingPhotoId,
  alt: string,
  objectPosition: string,
  baseUrl: string,
  extras: {
    width?: number;
    height?: number;
    defaultSizes?: string;
    objectFit?: MarketingPhotoFit;
  } = {},
): MarketingPhotoAsset {
  const spec = PHOTO_FILES[id];
  const width = extras.width ?? Math.max(...spec.widths);
  return {
    id,
    alt,
    width,
    height: extras.height ?? 864,
    objectPosition,
    objectFit: extras.objectFit ?? "cover",
    src: marketingAssetUrl(`${spec.file}-${width}w.jpg`, baseUrl),
    sources: [
      { type: "image/webp", srcSet: variants(spec.file, "webp", spec.widths, baseUrl) },
      { type: "image/jpeg", srcSet: variants(spec.file, "jpg", spec.widths, baseUrl) },
    ],
    defaultSizes: extras.defaultSizes ?? "(max-width: 1024px) 100vw, 720px",
  };
}

export function createMarketingPhotos(
  baseUrl: string = import.meta.env.BASE_URL,
): Record<MarketingPhotoId, MarketingPhotoAsset> {
  return {
    brandHero: photoAsset(
      "brandHero",
      "Priority Property Pros branded banner: a homeowner on a couch messages for a pro while a Priority Property Pros contractor by a van receives a new job request, with the logo, From Need to Done, post-connect-get-it-done steps, and Find a Pro Today.",
      "center center",
      baseUrl,
      {
        width: 1152,
        height: 768,
        defaultSizes: "100vw",
        objectFit: "contain",
      },
    ),
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
      "center 68%",
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
      "center 55%",
      baseUrl,
    ),
    homeowners: photoAsset(
      "homeowners",
      "Two homeowners standing together in front of a house with the lights on at dusk.",
      "center center",
      baseUrl,
      { width: 650, height: 312, defaultSizes: "(max-width: 1024px) 100vw, 720px" },
    ),
    contractorDrill: photoAsset(
      "contractorDrill",
      "A contractor in a cap and tool belt driving screws into wood framing with a yellow drill.",
      "center center",
      baseUrl,
      { width: 467, height: 370, defaultSizes: "(max-width: 1024px) 100vw, 480px" },
    ),
    categoryKitchen: photoAsset(
      "categoryKitchen",
      "A bright kitchen with white cabinets, a wood island, and a farmhouse sink.",
      "center center",
      baseUrl,
      { width: 188, height: 136, defaultSizes: "(max-width: 640px) 46vw, 220px" },
    ),
    categoryBathroom: photoAsset(
      "categoryBathroom",
      "A bathroom with a freestanding tub, glass shower, and vanity.",
      "center center",
      baseUrl,
      { width: 195, height: 136, defaultSizes: "(max-width: 640px) 46vw, 220px" },
    ),
    categoryDecks: photoAsset(
      "categoryDecks",
      "A covered outdoor deck with wood beams, ceiling fans, and patio furniture.",
      "center center",
      baseUrl,
      { width: 196, height: 136, defaultSizes: "(max-width: 640px) 46vw, 220px" },
    ),
    categoryRoofing: photoAsset(
      "categoryRoofing",
      "Close view of architectural shingles on a sloped roof.",
      "center center",
      baseUrl,
      { width: 194, height: 136, defaultSizes: "(max-width: 640px) 46vw, 220px" },
    ),
    categoryHvac: photoAsset(
      "categoryHvac",
      "An outdoor air-conditioning condenser beside a brick wall and garden.",
      "center center",
      baseUrl,
      { width: 191, height: 136, defaultSizes: "(max-width: 640px) 46vw, 220px" },
    ),
    categoryPainting: photoAsset(
      "categoryPainting",
      "A painter in white clothes rolling paint onto an interior wall.",
      "center center",
      baseUrl,
      { width: 186, height: 136, defaultSizes: "(max-width: 640px) 46vw, 220px" },
    ),
    categoryLandscaping: photoAsset(
      "categoryLandscaping",
      "A landscaped garden bed with shrubs and orange and yellow flowers.",
      "center center",
      baseUrl,
      { width: 198, height: 136, defaultSizes: "(max-width: 640px) 46vw, 220px" },
    ),
    categoryHandyman: photoAsset(
      "categoryHandyman",
      "A tool belt with a tape measure and hammer on a wood surface.",
      "center center",
      baseUrl,
      { width: 194, height: 136, defaultSizes: "(max-width: 640px) 46vw, 220px" },
    ),
    portfolioDeck: photoAsset(
      "portfolioDeck",
      "Marketing photo of a furnished deck with string lights at dusk. Not a contractor's completed project.",
      "center center",
      baseUrl,
      { width: 455, height: 196, defaultSizes: "(max-width: 768px) 100vw, 480px" },
    ),
    trustCouple: photoAsset(
      "trustCouple",
      "Marketing photo of an older couple outdoors giving a thumbs-up. They are not identified as Priority Property Pros customers.",
      "center center",
      baseUrl,
      { width: 322, height: 194, defaultSizes: "(max-width: 768px) 100vw, 420px" },
    ),
  };
}

export const MARKETING_PHOTOS: Record<MarketingPhotoId, MarketingPhotoAsset> = createMarketingPhotos();

export const OFFICIAL_CATEGORY_CARDS = [
  {
    id: "kitchen",
    photoId: "categoryKitchen",
    title: "Kitchen remodeling",
    blurb: "Cabinets, counters, and layout. Describe the job in your own words — this is not a separate PPP trade.",
    serviceName: null,
    postQuery: "Kitchen remodeling",
  },
  {
    id: "bathroom",
    photoId: "categoryBathroom",
    title: "Bathroom remodeling",
    blurb: "Fixtures, tile, and layout. Describe the job in your own words — this is not a separate PPP trade.",
    serviceName: null,
    postQuery: "Bathroom remodeling",
  },
  {
    id: "decks",
    photoId: "categoryDecks",
    title: "Deck Repair",
    blurb: "Boards, rails, small rot.",
    serviceName: "Deck Repair",
    postQuery: "Deck Repair",
  },
  {
    id: "roofing",
    photoId: "categoryRoofing",
    title: "Roofing",
    blurb: "Shingles, leaks, and repairs. Describe the job in your own words — this is not a separate PPP trade.",
    serviceName: null,
    postQuery: "Roofing",
  },
  {
    id: "hvac",
    photoId: "categoryHvac",
    title: "HVAC",
    blurb: "Heating and cooling. Not an ordinary unverified PPP category — describe the job in your own words.",
    serviceName: null,
    postQuery: "HVAC",
  },
  {
    id: "painting",
    photoId: "categoryPainting",
    title: "Painting",
    blurb: "Rooms, trim, touch-ups.",
    serviceName: "Painting",
    postQuery: "Painting",
  },
  {
    id: "landscaping",
    photoId: "categoryLandscaping",
    title: "Landscaping",
    blurb: "Beds, mulch, simple plantings.",
    serviceName: "Landscaping",
    postQuery: "Landscaping",
  },
  {
    id: "handyman",
    photoId: "categoryHandyman",
    title: "Handyman",
    blurb: "Small fixes around the house.",
    serviceName: "Handyman",
    postQuery: "Handyman",
  },
] as const;
