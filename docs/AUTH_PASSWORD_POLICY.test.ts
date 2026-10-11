import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const doc = readFileSync(
  path.join(path.dirname(fileURLToPath(import.meta.url)), "AUTH_PASSWORD_POLICY.md"),
  "utf8",
);

describe("AUTH_PASSWORD_POLICY", () => {
  it("tells the owner to set the dashboard minimum to 8 and leave classes off", () => {
    expect(doc).toMatch(/Minimum password length/);
    expect(doc).toMatch(/8/);
    expect(doc).toMatch(/bersftkjpbzpgtahbqwd/);
    expect(doc).toMatch(/Leave required character classes unset/);
    expect(doc).toMatch(/config\.toml/);
    expect(doc).toMatch(/\/auth\/v1\/signup/);
  });

  it("does not tell the owner to enable leaked-password protection now", () => {
    expect(doc).toMatch(/Leave it off/);
    expect(doc).toMatch(/Pro plan/);
    expect(doc).toMatch(/https:\/\/supabase.com\/pricing/);
    expect(doc).not.toMatch(/Enable leaked password protection now/);
  });
});
