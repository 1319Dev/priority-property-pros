import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { collapseActivity } from "./activityCollapse";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const previous = readFileSync(path.join(root, "supabase/migrations/20261014120000_admin_dashboard_rpcs.sql"), "utf8");
const migration = readFileSync(path.join(root, "supabase/migrations/20261019300005_admin_dashboard_support_copy.sql"), "utf8");

function summaryBody(source: string): string {
  const start = source.indexOf("CREATE OR REPLACE FUNCTION public.admin_dashboard_summary");
  const end = source.indexOf("COMMENT ON FUNCTION public.admin_dashboard_summary");
  return source.slice(start, end);
}

describe("dashboard support copy", () => {
  it("changes only the support mailbox sentence", () => {
    const before = summaryBody(previous);
    const after = summaryBody(migration);
    expect(after).not.toMatch(/gmail/i);
    expect(after).toContain("support@prioritypropertypros.com");
    expect(after).toContain("The inbox arrives with the contact form.");
    expect(after.replace("support@prioritypropertypros.com. The inbox arrives with the contact form.", "prioritypropertypros@gmail.com")).toBe(before);
    expect(migration).toContain("REVOKE ALL ON FUNCTION public.admin_dashboard_summary(boolean) FROM PUBLIC, anon");
    expect(migration).toContain("PERFORM public.admin_require()");
    expect(migration).not.toMatch(/\bUPDATE\b|\bINSERT\b|\bDELETE\b/);
  });

  it("collapses only consecutive identical activity rows", () => {
    const rows = collapseActivity([
      { label: "Account flag updated", subjectLabel: "Tina", jobReference: null, cursor: "a" },
      { label: "Account flag updated", subjectLabel: "Tina", jobReference: null, cursor: "b" },
      { label: "Project posted", subjectLabel: "Owen", jobReference: "PPP-1004", cursor: "c" },
      { label: "Account flag updated", subjectLabel: "Tina", jobReference: null, cursor: "d" },
    ]);
    expect(rows.map((row) => [row.label, row.count, row.cursor])).toEqual([
      ["Account flag updated", 2, "a"],
      ["Project posted", 1, "c"],
      ["Account flag updated", 1, "d"],
    ]);
  });
});
