/**
 * Fictional EXAMPLE / DEMO marketplace content.
 * These are not live accounts. They must stay labeled so they cannot be
 * mistaken for real contractors, homeowners, verifiers, or jobs.
 * Demo contractor cards use anonymized trade labels, not googable business names.
 */

export const DEMO_LABEL = "EXAMPLE / DEMO";
export const DEMO_BANNER =
  "These are labeled examples so you can see how the marketplace looks. They are not real people, businesses, or jobs.";

export type DemoBadge = {
  kind: "LICENSE" | "INSURANCE" | "OTHER" | "APPROVED";
  label: string;
};

export type DemoPortfolioItem = {
  id: string;
  caption: string;
  sortOrder: number;
  illustration: "fence" | "interior" | "yard";
};

export type DemoReview = {
  id: string;
  rating: number;
  body: string;
  demo: true;
};

export type DemoContractor = {
  slug: string;
  displayLabel: string;
  photoInitials: string;
  categories: string[];
  serviceArea: string;
  yearsExperience: number | null;
  ratingAverage: number | null;
  ratingCount: number;
  badges: DemoBadge[];
  shortDescription: string;
  about: string;
  portfolio: DemoPortfolioItem[];
  reviews: DemoReview[];
};

export type DemoHomeowner = {
  slug: string;
  displayName: string;
  photoInitials: string;
  generalArea: string;
  shortDescription: string;
};

export type DemoVerifier = {
  slug: string;
  displayName: string;
  photoInitials: string;
  coverageArea: string;
  shortDescription: string;
};

export type DemoProject = {
  slug: string;
  title: string;
  category: string;
  city: string;
  state: string;
  zip: string;
  timing: string;
  shortDescription: string;
};

export const DEMO_CONTRACTORS: DemoContractor[] = [
  {
    slug: "example-fence-pro",
    displayLabel: "Example Fence Pro",
    photoInitials: "FP",
    categories: ["Fence Repair", "Deck Repair"],
    serviceArea: "Cedar Park / Leander Area",
    yearsExperience: 11,
    ratingAverage: 4.8,
    ratingCount: 12,
    badges: [
      { kind: "APPROVED", label: "Approved Pro" },
      { kind: "LICENSE", label: "License reviewed" },
      { kind: "INSURANCE", label: "Insurance reviewed" },
    ],
    shortDescription: "Example independent fence work used to show a public pro card. Fictional — not a real business.",
    about: "EXAMPLE / DEMO PROFILE. This fictional fence specialist shows how a public card looks after approval. No real business name or contact is listed.",
    portfolio: [
      {
        id: "demo-fence-1",
        caption: "Example screened fence repair photo",
        sortOrder: 1,
        illustration: "fence",
      },
    ],
    reviews: [
      {
        id: "demo-fence-review-1",
        rating: 5,
        body: "Example review — the gate latch was reset and the panel sat true. Fictional customer.",
        demo: true,
      },
    ],
  },
  {
    slug: "example-handyman-pro",
    displayLabel: "Example Handyman Pro",
    photoInitials: "HP",
    categories: ["Handyman", "TV Mounting", "Drywall Repair"],
    serviceArea: "Round Rock / Pflugerville Area",
    yearsExperience: 8,
    ratingAverage: 4.6,
    ratingCount: 9,
    badges: [
      { kind: "APPROVED", label: "Approved Pro" },
      { kind: "INSURANCE", label: "Insurance reviewed" },
    ],
    shortDescription: "Demo handyman profile so visitors can browse a sample card. Fictional — not a real contractor.",
    about: "EXAMPLE / DEMO PROFILE. Sample indoor-repair card used to show services, badges, and example reviews. Not a live contractor.",
    portfolio: [
      {
        id: "demo-handyman-1",
        caption: "Example screened interior repair photo",
        sortOrder: 1,
        illustration: "interior",
      },
    ],
    reviews: [
      {
        id: "demo-handyman-review-1",
        rating: 5,
        body: "Example review — TV mount was level and the patch blended. Not a real customer.",
        demo: true,
      },
    ],
  },
  {
    slug: "example-lawn-care-pro",
    displayLabel: "Example Lawn Care Pro",
    photoInitials: "LP",
    categories: ["Lawn Care", "Pressure Washing", "Property Cleanup"],
    serviceArea: "Georgetown / North Austin Area",
    yearsExperience: 6,
    ratingAverage: null,
    ratingCount: 0,
    badges: [
      { kind: "APPROVED", label: "Approved Pro" },
      { kind: "OTHER", label: "Credential reviewed" },
    ],
    shortDescription: "Example outdoor-care card with no ratings yet, so empty ratings stay honest. Fictional.",
    about: "EXAMPLE / DEMO PROFILE. This example has zero PPP reviews so the directory can show New to Priority Property Pros instead of a made-up score.",
    portfolio: [
      {
        id: "demo-lawn-1",
        caption: "Example screened yard cleanup photo",
        sortOrder: 1,
        illustration: "yard",
      },
    ],
    reviews: [],
  },
];

export const DEMO_HOMEOWNERS: DemoHomeowner[] = [
  {
    slug: "example-jordan-p",
    displayName: "Example homeowner Jordan P.",
    photoInitials: "JP",
    generalArea: "Cedar Park Area",
    shortDescription:
      "Example property owner who posts a project and compares estimates. Fictional person — no real contact details.",
  },
  {
    slug: "demo-riley-m",
    displayName: "Demo property owner Riley M.",
    photoInitials: "RM",
    generalArea: "Round Rock Area",
    shortDescription: "Demo landlord profile for the public browse. Fictional — not a real customer account.",
  },
];

export const DEMO_VERIFIERS: DemoVerifier[] = [
  {
    slug: "example-morgan-lee",
    displayName: "Example verifier Morgan Lee",
    photoInitials: "ML",
    coverageArea: "Central Texas (example)",
    shortDescription: "Example independent completion verifier. Priority Verified is not live. Fictional person.",
  },
  {
    slug: "demo-casey-nguyen",
    displayName: "Demo verifier Casey Nguyen",
    photoInitials: "CN",
    coverageArea: "Austin suburbs (example)",
    shortDescription: "Demo verifier card so the browse can show the role. Not a real verifier and not Priority Verified.",
  },
];

export const DEMO_PROJECTS: DemoProject[] = [
  {
    slug: "example-cedar-fence-repair",
    title: "Example: cedar fence repair",
    category: "Fence Repair",
    city: "Cedar Park",
    state: "TX",
    zip: "78613",
    timing: "Within a week",
    shortDescription: "Sample posted job with city and ZIP only. Fictional project — no street, phone, or customer name.",
  },
  {
    slug: "demo-living-room-tv",
    title: "Demo: living-room TV mounting",
    category: "TV Mounting",
    city: "Round Rock",
    state: "TX",
    zip: "78681",
    timing: "As soon as possible",
    shortDescription: "Demo project used to show how a public sample looks. Not a real job and not someone else's private record.",
  },
  {
    slug: "example-garage-junk-haul",
    title: "Example: garage junk haul",
    category: "Junk Removal",
    city: "Georgetown",
    state: "TX",
    zip: "78626",
    timing: "Flexible",
    shortDescription: "Example cleanup job with a general area only. Fictional — no exact address or owner identity.",
  },
];

export function demoContractorPath(slug: string): string {
  return `/find-a-pro/example/${slug}`;
}

export function demoHomeownerPath(slug: string): string {
  return `/examples/homeowners/${slug}`;
}

export function demoVerifierPath(slug: string): string {
  return `/examples/verifiers/${slug}`;
}

export function demoProjectPath(slug: string): string {
  return `/examples/projects/${slug}`;
}

export function findDemoContractor(slug: string): DemoContractor | undefined {
  return DEMO_CONTRACTORS.find((row) => row.slug === slug);
}

export function findDemoHomeowner(slug: string): DemoHomeowner | undefined {
  return DEMO_HOMEOWNERS.find((row) => row.slug === slug);
}

export function findDemoVerifier(slug: string): DemoVerifier | undefined {
  return DEMO_VERIFIERS.find((row) => row.slug === slug);
}

export function findDemoProject(slug: string): DemoProject | undefined {
  return DEMO_PROJECTS.find((row) => row.slug === slug);
}
