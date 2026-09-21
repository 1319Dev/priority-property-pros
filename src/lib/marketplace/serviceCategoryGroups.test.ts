import { describe, expect, it } from "vitest";
import { SERVICES } from "../../data/services";
import {
  PROJECT_TYPE_TABS,
  PROJECT_TYPE_TAB_SLUGS,
  categoriesForProjectTypeTab,
  projectTypeTabForSlug,
} from "./serviceCategoryGroups";

describe("project type tab grouping", () => {
  it("keeps every seeded catalog slug in exactly one tab", () => {
    const assigned = PROJECT_TYPE_TABS.flatMap((tab) => [...PROJECT_TYPE_TAB_SLUGS[tab.id]]);
    expect(new Set(assigned).size).toBe(assigned.length);
    expect(assigned.sort()).toEqual([...SERVICES.map((service) => service.id)].sort());
  });

  it("maps known slugs to the Interior / Exterior / Outdoor / Moving / Other tabs", () => {
    expect(projectTypeTabForSlug("tv-mounting")).toBe("interior");
    expect(projectTypeTabForSlug("fence-repair")).toBe("exterior");
    expect(projectTypeTabForSlug("lawn-care")).toBe("outdoor");
    expect(projectTypeTabForSlug("moving-help")).toBe("moving");
    expect(projectTypeTabForSlug("other")).toBe("other");
  });

  it("puts unknown slugs in Other so future catalog rows still appear", () => {
    expect(projectTypeTabForSlug("brand-new-local-job")).toBe("other");
  });

  it("filters a flat category list without changing ids", () => {
    const categories = SERVICES.map((service) => ({ id: `id-${service.id}`, slug: service.id, name: service.name }));
    const outdoor = categoriesForProjectTypeTab(categories, "outdoor");
    expect(outdoor.map((item) => item.slug)).toEqual(["lawn-care", "landscaping", "property-cleanup"]);
    expect(outdoor[0]?.id).toBe("id-lawn-care");
  });
});
