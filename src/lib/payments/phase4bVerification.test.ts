import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { ORIGINAL_FEE_BRACKETS, ORIGINAL_MAX_FEE_CENTS, ORIGINAL_MIN_FEE_CENTS } from "../marketplace/feeEngine";
import { bookingUnlocksContact, canConfirmBooking } from "../marketplace/bookings";
import {
  buildPaymentSchedule,
  clientCanConfirmBooking,
  clientRedirectIsNotAuthoritative,
  contractorCanReceiveTransfers,
  mapConnectAccountStatus,
  processStripeEventIdempotent,
  webhookSignatureIsMandatory,
} from "./index";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");

function walk(dir: string, acc: string[] = []): string[] {
  for (const name of readdirSync(dir, { withFileTypes: true })) {
    if (name.name === "node_modules" || name.name === "dist" || name.name === ".git") continue;
    const next = path.join(dir, name.name);
    if (name.isDirectory()) walk(next, acc);
    else if (/\.(ts|tsx|js|mjs|sql|md|yml|example)$/.test(name.name) && !/\.test\.(ts|tsx)$/.test(name.name)) acc.push(next);
  }
  return acc;
}

describe("Phase 4B stop-point security checks", () => {
  const files = walk(path.join(repoRoot, "src")).concat(walk(path.join(repoRoot, "supabase/migrations")));
  const src = files.filter((file) => file.includes("/src/")).map((file) => readFileSync(file, "utf8")).join("\n");
  const sql = files.filter((file) => file.endsWith(".sql")).map((file) => readFileSync(file, "utf8")).join("\n");
  const envExample = readFileSync(path.join(repoRoot, ".env.example"), "utf8");
  const workflow = readFileSync(path.join(repoRoot, ".github/workflows/ci-pages.yml"), "utf8");

  it("keeps ORIGINAL/REPEAT fee schedules and snapshots unchanged", () => {
    expect(ORIGINAL_FEE_BRACKETS[0]).toEqual({ min_amount_cents: 0, max_amount_cents: 50_000, rate_bps: 800 });
    expect(ORIGINAL_MIN_FEE_CENTS).toBe(1_500);
    expect(ORIGINAL_MAX_FEE_CENTS).toBe(150_000);
    expect(sql).not.toMatch(/UPDATE public\.fee_schedules SET/);
    expect(sql).not.toMatch(/UPDATE public\.fee_schedule_brackets SET/);
  });

  it("confirms bookings only after webhook success, not client redirects", () => {
    expect(clientRedirectIsNotAuthoritative()).toBe(true);
    expect(clientCanConfirmBooking()).toBe(false);
    expect(canConfirmBooking({ accountType: "CUSTOMER", paymentsLive: false })).toBe(false);
    expect(bookingUnlocksContact("AWAITING_PAYMENT")).toBe(false);
    expect(sql).toMatch(/source', 'stripe_webhook'/);
    expect(src).toMatch(/Returning from Stripe does not confirm this booking/);
  });

  it("requires webhook signatures and is replay-safe", () => {
    expect(webhookSignatureIsMandatory()).toBe(true);
    const dup = processStripeEventIdempotent({
      event: { id: "evt_x", type: "payment_intent.succeeded", created: 1, data: { object: {} } },
      alreadyProcessedIds: new Set(["evt_x"]),
    });
    expect(dup.status).toBe("duplicate");
    expect(sql).toMatch(/stripe_event_id text NOT NULL UNIQUE/);
  });

  it("does not expose processor secrets to the Vite client", () => {
    expect(src).not.toMatch(/sk_live_[A-Za-z0-9]+/);
    expect(src).not.toMatch(/sk_test_[A-Za-z0-9]{8,}/);
    expect(src).not.toMatch(/whsec_[A-Za-z0-9]+/);
    expect(src).not.toMatch(/SUPABASE_SERVICE_ROLE_KEY\s*=/);
    expect(envExample).not.toMatch(/^[^#]*STRIPE_SECRET_KEY=/m);
    expect(envExample).toMatch(/VITE_STRIPE_PUBLISHABLE_KEY=pk_test_your_publishable_key/);
    expect(workflow).not.toMatch(/STRIPE_SECRET_KEY: \$\{\{/);
    expect(workflow).not.toMatch(/SERVICE_ROLE_KEY: \$\{\{/);
  });

  it("blocks transfers until Connect READY and never shows held money as available", () => {
    expect(contractorCanReceiveTransfers("ONBOARDING")).toBe(false);
    expect(
      mapConnectAccountStatus({
        details_submitted: true,
        charges_enabled: true,
        payouts_enabled: true,
        currently_due: [],
        transfers_capability: "active",
      }),
    ).toBe("READY");
    expect(src).toMatch(/Held or pending amounts are not available/);
    expect(sql).toMatch(/connected account is not READY for transfers|can_receive_transfers/);
  });

  it("builds schedule totals that match the booking and keeps test mode flags", () => {
    const plan = buildPaymentSchedule(1_250_000);
    expect(plan.items.reduce((sum, item) => sum + item.amount_cents, 0)).toBe(1_250_000);
    expect(plan.charges_live).toBe(false);
    expect(plan.payments_live).toBe(false);
    expect(sql).toMatch(/CONSTRAINT bookings_payments_not_live CHECK \(payments_live = false\)/);
  });
});
