/**
 * Client-side grouping for the flat `service_categories` catalog.
 * Tabs are presentation only — they do not invent extra DB categories.
 */

export const PROJECT_TYPE_TABS = [
  { id: "interior", label: "Interior" },
  { id: "exterior", label: "Exterior" },
  { id: "outdoor", label: "Outdoor & yard" },
  { id: "moving", label: "Moving & cleanup" },
  { id: "other", label: "Other" },
] as const;

export type ProjectTypeTabId = (typeof PROJECT_TYPE_TABS)[number]["id"];

export const PROJECT_TYPE_TAB_SLUGS: Record<ProjectTypeTabId, readonly string[]> = {
  interior: [
    "handyman",
    "furniture-assembly",
    "tv-mounting",
    "drywall-repair",
    "painting",
    "door-repair",
    "minor-carpentry",
    "appliance-installation",
  ],
  exterior: ["fence-repair", "pressure-washing", "gutter-cleaning", "deck-repair", "small-concrete"],
  outdoor: ["lawn-care", "landscaping", "property-cleanup"],
  moving: ["junk-removal", "moving-help", "cleaning"],
  other: ["general-maintenance", "other"],
};

const SLUG_TO_TAB = new Map<string, ProjectTypeTabId>(
  PROJECT_TYPE_TABS.flatMap((tab) => PROJECT_TYPE_TAB_SLUGS[tab.id].map((slug) => [slug, tab.id] as const)),
);

export function projectTypeTabForSlug(slug: string): ProjectTypeTabId {
  return SLUG_TO_TAB.get(slug) ?? "other";
}

export function categoriesForProjectTypeTab<T extends { slug: string }>(
  categories: T[],
  tabId: ProjectTypeTabId,
): T[] {
  return categories.filter((category) => projectTypeTabForSlug(category.slug) === tabId);
}
