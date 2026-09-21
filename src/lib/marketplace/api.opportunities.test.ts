import { beforeEach, describe, expect, it, vi } from "vitest";

const { state } = vi.hoisted(() => ({
  state: {
    from: vi.fn(),
  },
}));

vi.mock("../supabase/client", () => ({
  getSupabaseClient: () => ({ from: state.from }),
}));

import { fetchMyOpportunities } from "./api";

const kitchen = {
  id: "proj-live",
  title: "Kitchen faucet",
  description: "Replace faucet",
  city: "Atlanta",
  state: "GA",
  zip_code: "30318",
  timing: "ASAP",
  budget_min_cents: null,
  budget_max_cents: null,
  status: "POSTED",
  completeness: "HIGH",
  category_id: "cat-1",
  preferred_date: null,
  accepting_connections: true,
};

function queryResult(result: { data: unknown; error: { message: string } | null }) {
  const builder: Record<string, unknown> = {};
  const self = () => builder;
  builder.select = vi.fn(self);
  builder.eq = vi.fn(self);
  builder.order = vi.fn(() => Promise.resolve(result));
  builder.maybeSingle = vi.fn(() => Promise.resolve(result));
  builder.then = (resolve: (value: typeof result) => unknown, reject?: (reason: unknown) => unknown) =>
    Promise.resolve(result).then(resolve, reject);
  return builder;
}

describe("fetchMyOpportunities", () => {
  beforeEach(() => {
    state.from.mockReset();
  });

  it("loads the list when one related project is missing or unreadable", async () => {
    state.from.mockImplementation((table: string) => {
      if (table !== "opportunities") throw new Error(`unexpected table ${table}`);
      return queryResult({
        data: [
          {
            id: "opp-live",
            project_id: "proj-live",
            contractor_profile_id: "pro-1",
            match_id: null,
            status: "AVAILABLE",
            available_at: "2026-09-21T00:00:00Z",
            responded_at: null,
            expires_at: null,
            created_at: "2026-09-21T00:00:00Z",
            projects: kitchen,
          },
          {
            id: "opp-passed",
            project_id: "proj-hidden",
            contractor_profile_id: "pro-1",
            match_id: null,
            status: "PASSED",
            available_at: "2026-09-20T00:00:00Z",
            responded_at: "2026-09-21T00:00:00Z",
            expires_at: null,
            created_at: "2026-09-20T00:00:00Z",
            projects: null,
          },
        ],
        error: null,
      });
    });

    const rows = await fetchMyOpportunities("pro-1");
    expect(rows).toHaveLength(2);
    expect(rows[0]?.projects?.title).toBe("Kitchen faucet");
    expect(rows[1]?.status).toBe("PASSED");
    expect(rows[1]?.projects).toBeNull();
    expect(state.from).toHaveBeenCalledWith("opportunities");
    expect(state.from).not.toHaveBeenCalledWith("projects");
  });

  it("still returns passed rows when a fallback project fetch throws Project not found.", async () => {
    const listCalls: Array<{ data: unknown; error: { message: string } | null }> = [
      { data: null, error: { message: "Could not embed projects" } },
      {
        data: [
          {
            id: "opp-passed",
            project_id: "proj-hidden",
            contractor_profile_id: "pro-1",
            match_id: null,
            status: "PASSED",
            available_at: "2026-09-20T00:00:00Z",
            responded_at: "2026-09-21T00:00:00Z",
            expires_at: null,
            created_at: "2026-09-20T00:00:00Z",
          },
        ],
        error: null,
      },
    ];
    state.from.mockImplementation((table: string) => {
      if (table === "opportunities") {
        return queryResult(listCalls.shift() ?? { data: null, error: { message: "exhausted" } });
      }
      if (table === "projects") {
        return queryResult({ data: null, error: null });
      }
      throw new Error(`unexpected table ${table}`);
    });

    const rows = await fetchMyOpportunities("pro-1");
    expect(rows).toHaveLength(1);
    expect(rows[0]?.status).toBe("PASSED");
    expect(rows[0]?.projects).toBeNull();
  });
});
