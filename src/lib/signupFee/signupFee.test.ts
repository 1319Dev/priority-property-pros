import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { computeMarketplaceFee } from "../marketplace/feeEngine";
import { applySignupFeePaid } from "./applyEvent";
import {
  CHARGES_LIVE,
  FORBIDDEN_LEGACY_SIGNUP_FEE_CENTS,
  PAYMENTS_LIVE,
  SIGNUP_FEE_CENTS,
  STRIPE_TEST_MODE,
} from "./constants";
import { CONTRACTOR_SIGNUP_FEE_SENTENCE, CUSTOMER_SIGNUP_FEE_SENTENCE } from "./copy";
import { assertSignupFeeIsolation, SIGNUP_FEE_ISOLATION } from "./isolation";
import {
  CONTRACTOR_PLANS,
  FREE_PLAN_MONTHLY_CENTS,
  PRIORITY_PRO_MONTHLY_CENTS,
  PRIORITY_PRO_YEARLY_CENTS,
  computeMarketplaceFeeForPlan,
} from "./plans";
import {
  accountStatusAfterSignupPayment,
  approvalAfterSignupPayment,
  assertSignupFeeAmount,
  canCreateSignupFeeCharge,
  needsSignupFeePayment,
  payingSignupFeeActivatesJobPayments,
  payingSignupFeeApprovesContractor,
  payingSignupFeeEnablesConnectPayouts,
} from "./policy";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");

function allSql(): string {
  const dir = path.join(repoRoot, "supabase/migrations");
  return readdirSync(dir)
    .filter((name) => name.endsWith(".sql"))
    .sort()
    .map((name) => readFileSync(path.join(dir, name), "utf8"))
    .join("\n\n");
}

function functionSource(): string {
  const dir = path.join(repoRoot, "supabase/functions");
  const walk = (current: string, acc: string[] = []): string[] => {
    for (const name of readdirSync(current, { withFileTypes: true })) {
      const next = path.join(current, name.name);
      if (name.isDirectory()) walk(next, acc);
      else if (name.name.endsWith(".ts")) acc.push(readFileSync(next, "utf8"));
    }
    return acc;
  };
  return walk(dir).join("\n");
}

describe("$9.99 isolated signup fee", () => {
  const sql = allSql();
  const fns = functionSource();

  it("requires $9.99 (999 cents) for customer and contractor signup, not legacy $9", () => {
    expect(SIGNUP_FEE_CENTS).toBe(999);
    expect(FORBIDDEN_LEGACY_SIGNUP_FEE_CENTS).toBe(900);
    expect(() => assertSignupFeeAmount(900)).toThrow(/999/);
    expect(assertSignupFeeAmount(999)).toBe(999);
    expect(needsSignupFeePayment("CUSTOMER", "UNPAID")).toBe(true);
    expect(needsSignupFeePayment("CONTRACTOR", "UNPAID")).toBe(true);
    expect(needsSignupFeePayment("VERIFIER", "UNPAID")).toBe(false);
    expect(needsSignupFeePayment("CUSTOMER", "PAID")).toBe(false);
    expect(CUSTOMER_SIGNUP_FEE_SENTENCE).toMatch(/\$9\.99/);
    expect(CONTRACTOR_SIGNUP_FEE_SENTENCE).toMatch(/\$9\.99/);
    expect(sql).toMatch(/signup_fee_cents',\s*999/);
    expect(sql).toMatch(/CHECK \(amount_cents = 999\)/);
  });

  it("charges the fee only once per account", () => {
    expect(canCreateSignupFeeCharge("UNPAID")).toBe(true);
    expect(canCreateSignupFeeCharge("PAID")).toBe(false);
    const second = applySignupFeePaid({
      profile_id: "u1",
      amount_cents: 999,
      current_signup_fee_status: "PAID",
      current_account_status: "PENDING",
      current_approval_status: "PENDING",
      already_processed_event: false,
    });
    expect(second.already_paid).toBe(true);
    expect(sql).toMatch(/signup_fee_charges_one_paid/);
  });

  it("does not auto-approve contractors or change account_status when paid", () => {
    expect(payingSignupFeeApprovesContractor()).toBe(false);
    expect(approvalAfterSignupPayment("PENDING")).toBe("PENDING");
    expect(accountStatusAfterSignupPayment("PENDING")).toBe("PENDING");
    const paid = applySignupFeePaid({
      profile_id: "pro-1",
      amount_cents: 999,
      current_signup_fee_status: "UNPAID",
      current_account_status: "PENDING",
      current_approval_status: "PENDING",
      already_processed_event: false,
    });
    expect(paid.approval_status).toBe("PENDING");
    expect(paid.account_status).toBe("PENDING");
    expect(sql).toMatch(/Do not touch account_status or contractor approval/);
    expect(sql).not.toMatch(/SET approval_status = 'APPROVED'/);
  });

  it("does not activate job payments or Stripe Connect payouts", () => {
    expect(PAYMENTS_LIVE).toBe(0);
    expect(CHARGES_LIVE).toBe(0);
    expect(STRIPE_TEST_MODE).toBe(1);
    expect(payingSignupFeeActivatesJobPayments()).toBe(false);
    expect(payingSignupFeeEnablesConnectPayouts()).toBe(false);
    expect(assertSignupFeeIsolation(SIGNUP_FEE_ISOLATION).payments_live).toBe(0);
    expect(sql).toMatch(/'stripe_test_mode',\s*1/);
    expect(sql).not.toMatch(/payments_live',\s*1/);
    expect(sql).not.toMatch(/charges_live',\s*1/);
    expect(sql).toMatch(/payments_live and charges_live stay 0/);
    expect(fns).toMatch(/sk_test_/);
    expect(fns).not.toMatch(/stripeAccount|transfer_data|application_fee/);
    expect(fns).not.toMatch(/create-connect-account|confirm_booking/);
    expect(fns).toMatch(/ppp_kind/);
    expect(fns).toMatch(/signup_fee/);
  });

  it("keeps Free at $0/month and Priority Pro at $49/mo or $499/yr", () => {
    expect(FREE_PLAN_MONTHLY_CENTS).toBe(0);
    expect(CONTRACTOR_PLANS.FREE.monthly_cents).toBe(0);
    expect(PRIORITY_PRO_MONTHLY_CENTS).toBe(4_900);
    expect(PRIORITY_PRO_YEARLY_CENTS).toBe(49_900);
  });

  it("keeps existing marketplace fee calculations and Phase 5A job-payment pause", () => {
    const original = computeMarketplaceFee({ amount_cents: 100_000, kind: "ORIGINAL" });
    expect(original.fee_cents).toBe(7_500);
    expect(original.charges_live).toBe(false);
    expect(original.payments_live).toBe(false);
    const repeat = computeMarketplaceFee({ amount_cents: 100_000, kind: "REPEAT" });
    expect(repeat.fee_cents).toBe(2_000);
    const freeOriginal = computeMarketplaceFeeForPlan("FREE", { amount_cents: 100_000, kind: "ORIGINAL" });
    expect(freeOriginal.fee_cents).toBe(7_500);
    const proOriginal = computeMarketplaceFeeForPlan("PRIORITY_PRO", { amount_cents: 100_000, kind: "ORIGINAL" });
    expect(proOriginal.fee_cents).toBe(2_000);
    expect(sql).toMatch(/CONSTRAINT bookings_payments_not_live CHECK \(payments_live = false\)/);
    expect(sql).toMatch(/CONSTRAINT bookings_charges_not_live CHECK \(charges_live = false\)/);
  });
});
