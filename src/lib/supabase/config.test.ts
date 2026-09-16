import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { isSupabaseConfigured } from "./config";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");

describe("Supabase public config", () => {
  it("treats missing or placeholder env as not configured", () => {
    expect(isSupabaseConfigured()).toBe(false);
  });

  it("documents public vars only in .env.example", () => {
    const example = readFileSync(path.join(root, ".env.example"), "utf8");
    expect(example).toMatch(/VITE_SUPABASE_URL=/);
    expect(example).toMatch(/VITE_SUPABASE_ANON_KEY=/);
    expect(example).toMatch(/YOUR-PROJECT-REF/);
    expect(example).toMatch(/your-anon-public-key/);
    expect(example).not.toMatch(/^[^#]*SERVICE_ROLE.*=\s*eyJ/m);
    expect(example).not.toMatch(/sk_live/);
  });
});
