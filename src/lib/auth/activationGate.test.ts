import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");

describe("activation and role gates in source", () => {
  it("nests customer, contractor, and admin dashboards under RequireAuth", () => {
    const app = readFileSync(path.join(root, "src/App.tsx"), "utf8");
    const start = app.indexOf("<Route element={<RequireAuth />}>");
    expect(start).toBeGreaterThan(0);
    const guarded = app.slice(start);
    expect(guarded).toMatch(/path="\/app\/customer"/);
    expect(guarded).toMatch(/path="\/app\/pro"/);
    expect(guarded).toMatch(/RequireAdmin/);
    expect(guarded).toMatch(/path="\/app\/admin"/);
  });

  it("keeps the latest profile trigger from accepting a client role or signup-fee change", () => {
    const sql = readFileSync(
      path.join(root, "supabase/migrations/20261005000001_signup_activation_checkout.sql"),
      "utf8",
    );
    const start = sql.lastIndexOf("CREATE OR REPLACE FUNCTION public.protect_profile_columns()");
    const body = sql.slice(start, start + 1800);
    expect(body).toMatch(/ADMIN cannot be assigned from the client/);
    expect(body).toMatch(/account_type cannot be changed by the account owner/);
    expect(body).toMatch(/signup fee fields cannot be changed from the client/);
    expect(body).toMatch(/email cannot be changed from the client/);
    expect(sql).toMatch(/signup fee required/);
  });
});
