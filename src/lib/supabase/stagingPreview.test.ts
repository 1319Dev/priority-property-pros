import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  PRODUCTION_SUPABASE_REF,
  STAGING_SUPABASE_REF,
  assertStagingSupabaseTarget,
  isStagingAppEnv,
  stagingSupabaseGuardError,
} from "./config";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");

const stagingUrl = `https://${STAGING_SUPABASE_REF}.supabase.co`;
const productionUrl = `https://${PRODUCTION_SUPABASE_REF}.supabase.co`;

describe("staging preview env guard", () => {
  it("is inactive unless VITE_APP_ENV=staging", () => {
    expect(isStagingAppEnv("")).toBe(false);
    expect(isStagingAppEnv("production")).toBe(false);
    expect(isStagingAppEnv("staging")).toBe(true);
    expect(stagingSupabaseGuardError(productionUrl, "production")).toBeNull();
    expect(stagingSupabaseGuardError(productionUrl, undefined)).toBeNull();
    expect(() => assertStagingSupabaseTarget(productionUrl, "production")).not.toThrow();
  });

  it("refuses to start when staging URL hostname contains the production ref", () => {
    const message = stagingSupabaseGuardError(productionUrl, "staging");
    expect(message).toMatch(/refused to start/i);
    expect(message).toMatch(PRODUCTION_SUPABASE_REF);
    expect(() => assertStagingSupabaseTarget(productionUrl, "staging")).toThrow(/production/);
  });

  it("requires the staging project ref when VITE_APP_ENV=staging", () => {
    expect(stagingSupabaseGuardError("https://someotherref.supabase.co", "staging")).toMatch(
      STAGING_SUPABASE_REF,
    );
    expect(stagingSupabaseGuardError("", "staging")).toMatch(/missing or not a valid URL/i);
    expect(stagingSupabaseGuardError(stagingUrl, "staging")).toBeNull();
    expect(() => assertStagingSupabaseTarget(stagingUrl, "staging")).not.toThrow();
  });
});

describe("staging preview wiring (no secrets, no Pages deploy)", () => {
  it("documents public staging env only", () => {
    const example = readFileSync(path.join(root, ".env.example"), "utf8");
    const viteEnv = readFileSync(path.join(root, "src/vite-env.d.ts"), "utf8");
    expect(viteEnv).toMatch(/VITE_APP_ENV/);
    expect(example).toMatch(/VITE_APP_ENV=staging/);
    expect(example).toMatch(STAGING_SUPABASE_REF);
    expect(example).toMatch(PRODUCTION_SUPABASE_REF);
    expect(example).not.toMatch(/^[^#]*SERVICE_ROLE.*=\s*\S+/m);
    expect(example).not.toMatch(/sk_live/);
    expect(example).not.toMatch(/STRIPE_SECRET/);
  });

  it("adds a staging-preview workflow that does not deploy production Pages", () => {
    const stagingWorkflow = readFileSync(
      path.join(root, ".github/workflows/staging-preview.yml"),
      "utf8",
    );
    const pagesWorkflow = readFileSync(path.join(root, ".github/workflows/ci-pages.yml"), "utf8");
    expect(stagingWorkflow).toMatch(/branches:\s*\[phase-5a-staging-preview\]/);
    expect(stagingWorkflow).toMatch(/VITE_APP_ENV:\s*staging/);
    expect(stagingWorkflow).toMatch(/STAGING_SUPABASE_URL/);
    expect(stagingWorkflow).toMatch(/STAGING_SUPABASE_ANON_KEY/);
    expect(stagingWorkflow).toMatch(/name:\s*phase5a-staging-preview/);
    expect(stagingWorkflow).not.toMatch(/deploy-pages/);
    expect(stagingWorkflow).not.toMatch(/upload-pages-artifact/);
    expect(stagingWorkflow).toMatch(/Never add SUPABASE_SERVICE_ROLE_KEY here/);
    expect(stagingWorkflow).not.toMatch(/SERVICE_ROLE_KEY: \$\{\{/);
    expect(stagingWorkflow).not.toMatch(/STRIPE/);
    expect(pagesWorkflow).toMatch(/branches:\s*\[main\]/);
    expect(pagesWorkflow).toMatch(/github\.ref == 'refs\/heads\/main'/);
    expect(pagesWorkflow).toMatch(/actions\/deploy-pages@v4/);
    expect(pagesWorkflow).not.toMatch(/phase-5a-staging-preview/);
  });
});
