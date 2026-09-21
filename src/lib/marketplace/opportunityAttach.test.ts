import { describe, expect, it, vi } from "vitest";
import {
  attachOpportunityProject,
  attachOpportunityProjects,
  normalizeOpportunityProject,
  opportunityListTitle,
} from "./opportunityAttach";

const kitchen = {
  id: "proj-live",
  title: "Kitchen faucet",
  description: "Replace faucet",
  city: "Atlanta",
  state: "GA",
  zip_code: "30318",
  timing: "ASAP" as const,
  budget_min_cents: null,
  budget_max_cents: null,
  status: "POSTED" as const,
  completeness: "HIGH" as const,
  category_id: "cat-1",
  preferred_date: null,
  accepting_connections: true,
};

describe("attachOpportunityProject", () => {
  it("keeps an embedded project and does not refetch", async () => {
    const loadProject = vi.fn(async () => {
      throw new Error("Project not found.");
    });
    const result = await attachOpportunityProject(
      { id: "opp-1", project_id: "proj-live", status: "AVAILABLE", projects: kitchen },
      loadProject,
    );
    expect(result.projects?.title).toBe("Kitchen faucet");
    expect(loadProject).not.toHaveBeenCalled();
  });

  it("treats an embedded null project as unreadable instead of throwing", async () => {
    const loadProject = vi.fn(async () => {
      throw new Error("Project not found.");
    });
    const result = await attachOpportunityProject(
      { id: "opp-2", project_id: "proj-passed", status: "PASSED", projects: null },
      loadProject,
    );
    expect(result.projects).toBeNull();
    expect(loadProject).not.toHaveBeenCalled();
  });

  it("continues when one project fetch fails / returns null", async () => {
    const loadProject = vi.fn(async (projectId: string) => {
      if (projectId === "proj-missing") throw new Error("Project not found.");
      return kitchen;
    });
    const rows = await attachOpportunityProjects(
      [
        { id: "opp-live", project_id: "proj-live", status: "AVAILABLE" },
        { id: "opp-passed", project_id: "proj-missing", status: "PASSED" },
      ],
      loadProject,
    );
    expect(rows).toHaveLength(2);
    expect(rows[0]?.projects?.title).toBe("Kitchen faucet");
    expect(rows[1]?.projects).toBeNull();
    expect(rows[1]?.status).toBe("PASSED");
    expect(loadProject).toHaveBeenCalledTimes(2);
  });
});

describe("normalizeOpportunityProject", () => {
  it("unwraps one-to-many arrays and rejects empty payloads", () => {
    expect(normalizeOpportunityProject([kitchen])?.id).toBe("proj-live");
    expect(normalizeOpportunityProject(null)).toBeNull();
    expect(normalizeOpportunityProject({})).toBeNull();
  });
});

describe("opportunityListTitle", () => {
  it("falls back for passed jobs whose project is unreadable", () => {
    expect(opportunityListTitle({ status: "PASSED", projects: null })).toBe("Passed job");
    expect(opportunityListTitle({ status: "AVAILABLE", projects: null })).toBe("Project");
    expect(opportunityListTitle({ status: "PASSED", projects: { title: "Deck repair" } })).toBe("Deck repair");
  });
});
