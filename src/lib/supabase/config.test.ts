import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { isConfiguredPair } from "./config";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");

describe("Supabase public config", () => {
  it("treats missing or placeholder env as not configured", () => {
    expect(isConfiguredPair("", "")).toBe(false);
    expect(isConfiguredPair("https://YOUR-PROJECT-REF.supabase.co", "your-anon-public-key")).toBe(false);
    expect(isConfiguredPair("https://example.supabase.co", "your-anon-public-key")).toBe(false);
    expect(isConfiguredPair("https://example.supabase.co", "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.demo")).toBe(true);
  });

  it("documents public vars only in .env.example", () => {
    const example = readFileSync(path.join(root, ".env.example"), "utf8");
    expect(example).toMatch(/VITE_SUPABASE_URL=/);
    expect(example).toMatch(/VITE_SUPABASE_ANON_KEY=/);
    expect(example).toMatch(/YOUR-PROJECT-REF/);
    expect(example).toMatch(/your-anon-public-key/);
    expect(example).not.toMatch(/^[^#]*SERVICE_ROLE.*=\s*eyJ/m);
    expect(example).not.toMatch(/sk_live/);
    expect(example).not.toMatch(/^[^#]*STRIPE_SECRET.*=\s*\S+/m);
  });

  it("does not declare privileged keys on the Vite client type surface", () => {
    const viteEnv = readFileSync(path.join(root, "src/vite-env.d.ts"), "utf8");
    expect(viteEnv).not.toMatch(/SERVICE_ROLE/);
    expect(viteEnv).not.toMatch(/STRIPE_SECRET/);
    expect(viteEnv).not.toMatch(/DATABASE_URL/);
  });
});
