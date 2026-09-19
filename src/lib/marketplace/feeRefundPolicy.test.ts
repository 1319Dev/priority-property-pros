import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  CONNECTION_FEE_NON_REFUNDABLE,
  PLATFORM_FEES_NON_REFUNDABLE,
  SIGNUP_FEE_NON_REFUNDABLE,
} from "../../data/pricing";
import { REFUND_CONCEPT_COPY } from "./connectionLifecycle";
import { CHARGES_LIVE, PAYMENTS_LIVE, SIGNUP_FEE_ENABLED } from "./types";
import { CONNECTION_FEE_CHECKOUT_ENABLED, LEGACY_JOB_PAYMENT_FUNCTIONS } from "./connectionCheckout";
import {
  canRefundPlatformFee,
  NON_REFUNDABLE_PLATFORM_FEES,
  PLATFORM_FEE_REFUND_BLOCKED,
  PLATFORM_FEE_REFUND_BLOCKED_REASON,
  refundPlatformFee,
} from "./feeRefundPolicy";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");

const STRIPE_REFUND_API = [
  /stripe\.refunds/i,
  /refunds\.create/,
  /\/v1\/refunds/,
  /functions\/v1\/create-refund/,
];

function collectFiles(entry: string, acc: string[] = []): string[] {
  const stats = statSync(entry);
  if (stats.isDirectory()) {
    const name = path.basename(entry);
    if (name === "node_modules" || name === "dist" || name === "assets") return acc;
    for (const child of readdirSync(entry)) {
      collectFiles(path.join(entry, child), acc);
    }
    return acc;
  }
  if (/\.(ts|tsx|js|jsx|sql)$/.test(entry)) acc.push(entry);
  return acc;
}

describe("non-refundable platform fee policy", () => {
  it("blocks in-app refunds of signup and connection fees", () => {
    expect(PLATFORM_FEE_REFUND_BLOCKED).toBe(true);
    expect(NON_REFUNDABLE_PLATFORM_FEES).toEqual(["signup_activation", "connection_fee"]);
    expect(canRefundPlatformFee("signup_activation")).toBe(false);
    expect(canRefundPlatformFee("connection_fee")).toBe(false);
    expect(PLATFORM_FEE_REFUND_BLOCKED_REASON).toMatch(/non-refundable/i);
    expect(() => refundPlatformFee("signup_activation")).toThrow(/non-refundable/i);
    expect(() => refundPlatformFee("connection_fee")).toThrow(/does not issue refunds/i);
  });

  it("keeps public copy constants aligned with the block", () => {
    expect(SIGNUP_FEE_NON_REFUNDABLE).toMatch(/non-refundable/i);
    expect(CONNECTION_FEE_NON_REFUNDABLE).toMatch(/non-refundable/i);
    expect(PLATFORM_FEES_NON_REFUNDABLE).toMatch(/\$9\.99/);
    expect(PLATFORM_FEES_NON_REFUNDABLE).toMatch(/\$4\.99/);
    expect(REFUND_CONCEPT_COPY).toMatch(/non-refundable/i);
    expect(REFUND_CONCEPT_COPY).toMatch(/this app does not issue refunds/i);
  });

  it("does not enable live payment flags", () => {
    expect(PAYMENTS_LIVE).toBe(false);
    expect(CHARGES_LIVE).toBe(false);
    expect(SIGNUP_FEE_ENABLED).toBe(false);
    expect(CONNECTION_FEE_CHECKOUT_ENABLED).toBe(false);
  });

  it("has no Stripe refund helper or create-refund function for these fees", () => {
    expect(existsSync(path.join(repoRoot, "supabase/functions/create-refund"))).toBe(false);
    expect(LEGACY_JOB_PAYMENT_FUNCTIONS).toContain("create-refund");

    const roots = [
      path.join(repoRoot, "src"),
      path.join(repoRoot, "supabase/functions"),
      path.join(repoRoot, "supabase/migrations"),
    ];
    const hits: string[] = [];
    for (const root of roots) {
      for (const file of collectFiles(root)) {
        const rel = path.relative(repoRoot, file);
        if (/\.test\.(ts|tsx)$/.test(file)) continue;
        if (rel.endsWith("feeRefundPolicy.ts")) continue;
        const text = readFileSync(file, "utf8");
        for (const pattern of STRIPE_REFUND_API) {
          if (pattern.test(text)) hits.push(`${rel} matches ${pattern}`);
        }
      }
    }
    expect(hits).toEqual([]);
  });

  it("hard-blocks the SQL refund dead path and updates Terms of Use", () => {
    const sql = readFileSync(
      path.join(repoRoot, "supabase/migrations/20261001000001_non_refundable_platform_fees.sql"),
      "utf8",
    );
    expect(sql).toMatch(/reject_signup_or_connection_fee_refund/);
    expect(sql).toMatch(/RAISE EXCEPTION 'non_refundable_platform_fee'/);
    expect(sql).toMatch(/REVOKE ALL ON FUNCTION public\.reject_signup_or_connection_fee_refund/);
    expect(sql).toMatch(/service_role/);
    expect(sql).not.toMatch(/refunds\.create/);
    expect(sql).not.toMatch(/payments_live',\s*1/);
    expect(sql).not.toMatch(/charges_live',\s*1/);
    expect(sql).not.toMatch(/signup_fee_enabled',\s*1/);
    expect(sql).not.toMatch(/connection_fee_checkout_enabled',\s*1/);
    expect(sql).toMatch(/\$9\.99 account activation fee is a one-time fee to open an account and is non-refundable/);
    expect(sql).toMatch(/\$4\.99 Connection Fee purchases connection access only/);
    expect(sql).toMatch(/is non-refundable/);
  });
});
