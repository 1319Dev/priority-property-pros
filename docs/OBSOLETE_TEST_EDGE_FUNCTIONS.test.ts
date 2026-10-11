import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const planPath = path.join(repoRoot, "docs/OBSOLETE_TEST_EDGE_FUNCTIONS.md");

const OBSOLETE = [
  "stripe-webhook",
  "create-payment-intent",
  "create-connect-account-link",
  "create-transfer",
  "create-refund",
  "confirm-signup-fee-session",
] as const;

const LIVE_KEEP = [
  "create-signup-fee-checkout",
  "reconcile-signup-fee-checkout",
  "signup-fee-webhook",
  "create-connection-checkout",
  "reconcile-connection-checkout",
  "connection-fee-webhook",
];

function collect(entry: string, acc: string[] = []): string[] {
  if (!existsSync(entry)) return acc;
  const stats = statSync(entry);
  if (stats.isDirectory()) {
    const name = path.basename(entry);
    if (name === "node_modules" || name === "dist" || name === "assets") return acc;
    for (const child of readdirSync(entry)) collect(path.join(entry, child), acc);
    return acc;
  }
  if (/\.(ts|tsx|js|jsx|sql|toml|mjs)$/.test(entry)) acc.push(entry);
  return acc;
}

describe("obsolete test-mode edge function removal plan", () => {
  const plan = readFileSync(planPath, "utf8");

  it("names each deployed function and keeps the live checkout functions", () => {
    for (const name of OBSOLETE) {
      expect(plan).toContain(name);
      expect(existsSync(path.join(repoRoot, "supabase/functions", name))).toBe(false);
    }
    const config = readFileSync(path.join(repoRoot, "supabase/config.toml"), "utf8");
    for (const name of OBSOLETE) expect(config).not.toContain(`[functions.${name}]`);
    for (const name of LIVE_KEEP) expect(plan).toContain(name);
  });

  it("has no caller in the repo outside the denylist and this plan", () => {
    const roots = ["src", "supabase/functions", "supabase/migrations", "e2e", "scripts"].map((dir) =>
      path.join(repoRoot, dir),
    );
    const hits: string[] = [];
    for (const root of roots) {
      for (const file of collect(root)) {
        const text = readFileSync(file, "utf8");
        for (const name of OBSOLETE) {
          if (text.includes(`functions/v1/${name}`) || text.includes(`functions.invoke("${name}")`)) {
            hits.push(`${path.relative(repoRoot, file)} -> ${name}`);
          }
        }
      }
    }
    expect(hits).toEqual([]);
    const legacy = readFileSync(path.join(repoRoot, "src/lib/marketplace/connectionCheckout.ts"), "utf8");
    for (const name of OBSOLETE.slice(0, 5)) expect(legacy).toContain(`"${name}"`);
    expect(legacy).not.toContain("confirm-signup-fee-session");
  });

  it("tells the owner to confirm Stripe, download, then delete, with a redeploy rollback", () => {
    expect(plan).toMatch(/does not undeploy/i);
    expect(plan).toContain("Developers → Webhooks");
    expect(plan).toContain("/functions/v1/stripe-webhook");
    expect(plan).toContain("supabase functions download stripe-webhook --project-ref bersftkjpbzpgtahbqwd");
    expect(plan).toContain("supabase functions delete stripe-webhook");
    expect(plan).toContain("supabase functions deploy stripe-webhook --project-ref bersftkjpbzpgtahbqwd --no-verify-jwt");
    expect(plan).toContain("reject_signup_or_connection_fee_refund");
    expect(plan).toMatch(/\$9\.99/);
    expect(plan).toMatch(/\$4\.99/);
    expect(plan).not.toMatch(/supabase functions delete signup-fee-webhook/);
    expect(plan).not.toMatch(/supabase functions delete connection-fee-webhook/);
  });
});
