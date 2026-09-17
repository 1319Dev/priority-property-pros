/**
 * Fictional EXAMPLE / DEMO marketplace content.
 * These are not live accounts. They must stay labeled so they cannot be
 * mistaken for real contractors, homeowners, verifiers, or jobs.
 */

export const DEMO_LABEL = "EXAMPLE / DEMO";
export const DEMO_BANNER =
  "These are labeled examples so you can see how the marketplace looks. They are not real people, businesses, or jobs.";

export type DemoBadge = {
  kind: "LICENSE" | "INSURANCE" | "OTHER";
  label: string;
};

export type DemoContractor = {
  slug: string;
  businessName: string;
  photoInitials: string;
  categories: string[];
  serviceArea: string;
  ratingAverage: number | null;
  ratingCount: number;
  badges: DemoBadge[];
  shortDescription: string;
  headline: string;
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
    slug: "example-cedar-ridge-fence",
    businessName: "Example Cedar Ridge Fence Co.",
    photoInitials: "CR",
    categories: ["Fence Repair", "Deck Repair"],
    serviceArea: "Cedar Park / Leander area",
    ratingAverage: 4.8,
    ratingCount: 12,
    badges: [
      { kind: "LICENSE", label: "Example license reviewed" },
      { kind: "INSURANCE", label: "Example insurance reviewed" },
    ],
    shortDescription:
      "Example independent fence shop used to show a public pro card. Fictional — not a real business.",
    headline: "Example cedar fences and gate repairs",
  },
  {
    slug: "demo-hill-country-handyman",
    businessName: "Demo Hill Country Handyman",
    photoInitials: "HH",
    categories: ["Handyman", "TV Mounting", "Drywall Repair"],
    serviceArea: "Round Rock / Pflugerville area",
    ratingAverage: 4.6,
    ratingCount: 9,
    badges: [{ kind: "INSURANCE", label: "Example insurance reviewed" }],
    shortDescription:
      "Demo handyman profile so visitors can browse a sample card. Fictional — not a real contractor.",
    headline: "Demo small fixes around the house",
  },
  {
    slug: "example-oak-stone-care",
    businessName: "Example Oak & Stone Care",
    photoInitials: "OS",
    categories: ["Lawn Care", "Pressure Washing", "Property Cleanup"],
    serviceArea: "Georgetown / North Austin area",
    ratingAverage: null,
    ratingCount: 0,
    badges: [{ kind: "OTHER", label: "Example credential reviewed" }],
    shortDescription:
      "Example outdoor-care business with no ratings yet, so empty ratings stay honest. Fictional.",
    headline: "Example lawn, wash, and lot tidy",
  },
];

export const DEMO_HOMEOWNERS: DemoHomeowner[] = [
  {
    slug: "example-jordan-p",
    displayName: "Example homeowner Jordan P.",
    photoInitials: "JP",
    generalArea: "Cedar Park, TX",
    shortDescription:
      "Example property owner who posts a project and compares estimates. Fictional person — no real contact details.",
  },
  {
    slug: "demo-riley-m",
    displayName: "Demo property owner Riley M.",
    photoInitials: "RM",
    generalArea: "Round Rock, TX",
    shortDescription:
      "Demo landlord profile for the public browse. Fictional — not a real customer account.",
  },
];

export const DEMO_VERIFIERS: DemoVerifier[] = [
  {
    slug: "example-morgan-lee",
    displayName: "Example verifier Morgan Lee",
    photoInitials: "ML",
    coverageArea: "Central Texas (example)",
    shortDescription:
      "Example independent completion verifier. Priority Verified is not live. Fictional person.",
  },
  {
    slug: "demo-casey-nguyen",
    displayName: "Demo verifier Casey Nguyen",
    photoInitials: "CN",
    coverageArea: "Austin suburbs (example)",
    shortDescription:
      "Demo verifier card so the browse can show the role. Not a real verifier and not Priority Verified.",
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
    shortDescription:
      "Sample posted job with city and ZIP only. Fictional project — no exact address or contact details.",
  },
  {
    slug: "demo-living-room-tv",
    title: "Demo: living-room TV mounting",
    category: "TV Mounting",
    city: "Round Rock",
    state: "TX",
    zip: "78681",
    timing: "As soon as possible",
    shortDescription:
      "Demo project used to show how a public sample looks. Not a real job and not someone else's private record.",
  },
  {
    slug: "example-garage-junk-haul",
    title: "Example: garage junk haul",
    category: "Junk Removal",
    city: "Georgetown",
    state: "TX",
    zip: "78626",
    timing: "Flexible",
    shortDescription:
      "Example cleanup job with a general area only. Fictional — no exact address or owner identity.",
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
