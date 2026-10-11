import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const migration = readFileSync(path.join(root, "supabase/migrations/20261019300003_admin_projects_directory.sql"), "utf8");

describe("projects directory SQL", () => {
  it("is admin-only and leaves contact columns out of the list", () => {
    const list = migration.slice(migration.indexOf("FUNCTION public.admin_list_projects"), migration.indexOf("FUNCTION public.admin_get_project"));
    expect(list).toContain("PERFORM public.admin_require()");
    expect(list).not.toMatch(/phone|street|project_private|email/);
    expect(list).toContain("'city'");
    expect(list).toContain("'reference_number'");
    expect(migration).toContain("REVOKE ALL ON FUNCTION public.admin_list_projects(text, text, text, text, text, text, date, date, boolean, boolean, integer, integer) FROM PUBLIC, anon");
    expect(migration).toContain("REVOKE ALL ON FUNCTION public.admin_get_project(uuid) FROM PUBLIC, anon");
    expect(migration).not.toMatch(/\bUPDATE\b|\bINSERT\b|\bDELETE\b/);
  });
});
