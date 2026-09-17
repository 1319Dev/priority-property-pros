import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  CONTRACTOR_SIGNUP_HEADLINE,
  CONTRACTOR_SIGNUP_SUPPORTING,
  FREE_PLAN_NAME,
  FREE_PLAN_PRICE,
  HOMEPAGE_SIGNUP_HEADLINE,
  HOMEPAGE_SIGNUP_SUPPORTING,
  SIGNUP_FEE_NOT_MONTHLY,
  SIGNUP_FEE_SHORT,
} from "./pricing";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

/** Outdated phrases that imply creating an account costs nothing. */
const PROHIBITED_ACCOUNT_COPY = [
  /\bfree to join\b/i,
  /\bfree signup\b/i,
  /\bfree sign[- ]?up\b/i,
  /\bcreate an account for free\b/i,
  /\bfree accounts?\b/i,
  /\baccounts? are free\b/i,
  /\byour account is free\b/i,
  /\baccount is free\b/i,
  /\bjoining is free\b/i,
  /\bfree to post\b/i,
  /\bfree to hire\b/i,
  /\bget started free\b/i,
  /\bget started for free\b/i,
  /\bno cost to join\b/i,
  /\bjoin free\b/i,
  /\bstart free\b/i,
  /\bstart for free\b/i,
  /\bpost for free\b/i,
  /\bfree for homeowners\b/i,
  /\bfree for (customers|pros|contractors)\b/i,
  /\bsign ?ups? (are|is) free\b/i,
  /\bit'?s free to (join|post|hire|sign)\b/i,
];

const PUBLIC_COPY_ROOTS = [
  path.join(repoRoot, "src"),
  path.join(repoRoot, "public"),
  path.join(repoRoot, "index.html"),
  path.join(repoRoot, "vite.config.ts"),
];

function isSkippedFile(filePath: string): boolean {
  const base = path.basename(filePath);
  return /\.test\.(ts|tsx)$/.test(base) || base === "database.types.ts";
}

function collectPublicCopyFiles(entry: string, acc: string[] = []): string[] {
  const stats = statSync(entry);
  if (stats.isDirectory()) {
    const name = path.basename(entry);
    if (name === "node_modules" || name === "dist" || name === "assets") return acc;
    for (const child of readdirSync(entry)) {
      collectPublicCopyFiles(path.join(entry, child), acc);
    }
    return acc;
  }
  if (/\.(ts|tsx|js|jsx|html)$/.test(entry) && !isSkippedFile(entry)) {
    acc.push(entry);
  }
  return acc;
}

function publicFacingFiles(): string[] {
  return PUBLIC_COPY_ROOTS.flatMap((root) => collectPublicCopyFiles(root, []));
}

describe("public pricing copy", () => {
  it("states a one-time $9.99 signup fee, not a monthly signup charge", () => {
    expect(HOMEPAGE_SIGNUP_HEADLINE).toMatch(/one-time \$9\.99 signup fee/i);
    expect(HOMEPAGE_SIGNUP_SUPPORTING).toMatch(/no monthly homeowner subscription/i);
    expect(CONTRACTOR_SIGNUP_HEADLINE).toMatch(/one-time \$9\.99 signup fee/i);
    expect(CONTRACTOR_SIGNUP_SUPPORTING).toMatch(/\$0\/month Free plan/i);
    expect(SIGNUP_FEE_SHORT).toBe("$9.99 one-time signup fee");
    expect(SIGNUP_FEE_NOT_MONTHLY).toMatch(/not \$9\.99\/month/i);
    expect(FREE_PLAN_NAME).toBe("Free plan");
    expect(FREE_PLAN_PRICE).toBe("$0/month");
  });

  it("does not use outdated free-account language in public-facing application copy", () => {
    const hits: string[] = [];
    for (const file of publicFacingFiles()) {
      const text = readFileSync(file, "utf8");
      for (const pattern of PROHIBITED_ACCOUNT_COPY) {
        if (pattern.test(text)) {
          hits.push(`${path.relative(repoRoot, file)} matches ${pattern}`);
        }
      }
    }
    expect(hits).toEqual([]);
  });

  it("still allows contractor Free plan / $0/month wording in shared pricing copy", () => {
    const pricing = readFileSync(path.join(repoRoot, "src/data/pricing.ts"), "utf8");
    expect(pricing).toMatch(/Free plan/);
    expect(pricing).toMatch(/\$0\/month/);
    expect(pricing).not.toMatch(/Free to join/i);
  });
});
