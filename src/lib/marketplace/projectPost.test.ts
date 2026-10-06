import { describe, expect, it } from "vitest";
import { projectInsertForPost, runProjectSubmit } from "./projectPost";

const ready = {
  customerId: "cust-1",
  title: "Fence repair",
  description: "The gate sticks.",
  categoryId: "cat-1",
  city: "Atlanta",
  state: "GA",
  zipCode: "30318",
  timing: "FLEXIBLE" as const,
  preferredDate: "",
  budgetMinCents: 10000,
  budgetMaxCents: 20000,
};

describe("project insert happens only inside Post", () => {
  it("builds a draft row for the post RPC without treating it as a saved draft", () => {
    const row = projectInsertForPost(ready);
    expect(row.status).toBe("DRAFT");
    expect(row.customer_id).toBe("cust-1");
    expect(row.title).toBe("Fence repair");
    expect(row.category_id).toBe("cat-1");
    expect(row.zip_code).toBe("30318");
    expect(row.city).toBe("Atlanta");
    expect(row.preferred_date).toBeNull();
    expect(row).not.toHaveProperty("id");
  });

  it("refuses to build a row when title, type, or ZIP is missing", () => {
    expect(() => projectInsertForPost({ ...ready, title: "Hi" })).toThrow(/title, project type, and zip/i);
    expect(() => projectInsertForPost({ ...ready, categoryId: null })).toThrow(/title, project type, and zip/i);
    expect(() => projectInsertForPost({ ...ready, zipCode: "" })).toThrow(/title, project type, and zip/i);
    expect(() => projectInsertForPost({ ...ready, zipCode: "abc" })).toThrow(/title, project type, and zip/i);
  });

  it("refuses a budget range that is upside down", () => {
    expect(() => projectInsertForPost({ ...ready, budgetMinCents: 5000, budgetMaxCents: 1000 })).toThrow(/budget max/i);
  });

  it("posts after the insert and discards the row when posting fails", async () => {
    const calls: string[] = [];
    await expect(
      runProjectSubmit({
        insert: async () => {
          calls.push("insert");
          return { id: "proj-1" };
        },
        saveDetails: async (id) => {
          calls.push(`details:${id}`);
        },
        post: async (id) => {
          calls.push(`post:${id}`);
          throw new Error("match failed");
        },
        discard: async (id) => {
          calls.push(`discard:${id}`);
        },
      }),
    ).rejects.toThrow(/match failed/);
    expect(calls).toEqual(["insert", "details:proj-1", "post:proj-1", "discard:proj-1"]);
  });

  it("does not discard when the insert itself fails", async () => {
    const calls: string[] = [];
    await expect(
      runProjectSubmit({
        insert: async () => {
          calls.push("insert");
          throw new Error("not signed in");
        },
        saveDetails: async () => {
          calls.push("details");
        },
        post: async () => {
          calls.push("post");
        },
        discard: async () => {
          calls.push("discard");
        },
      }),
    ).rejects.toThrow(/not signed in/);
    expect(calls).toEqual(["insert"]);
  });

  it("keeps the posted project when post succeeds", async () => {
    const calls: string[] = [];
    const created = await runProjectSubmit({
      insert: async () => {
        calls.push("insert");
        return { id: "proj-2" };
      },
      saveDetails: async () => {
        calls.push("details");
      },
      post: async () => {
        calls.push("post");
      },
      discard: async () => {
        calls.push("discard");
      },
    });
    expect(created.id).toBe("proj-2");
    expect(calls).toEqual(["insert", "details", "post"]);
  });
});
