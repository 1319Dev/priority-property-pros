import { describe, expect, it } from "vitest";
import {
  accountActivationText,
  activationChargeStatusLabel,
  billingTotalChargedCents,
  buildBillingRows,
  connectStatusLabel,
} from "./proBilling";

describe("contractor billing rows", () => {
  const rows = buildBillingRows({
    connections: [
      { id: "c-paid", project_id: "p1", status: "PAID", fee_cents: 499, paid_at: "2026-10-04T23:17:56Z", created_at: "2026-10-04T23:00:00Z", cancelled_at: null, needs_refund: false },
      { id: "c-cancel", project_id: "p2", status: "CANCELLED", fee_cents: 499, paid_at: null, created_at: "2026-10-03T12:00:00Z", cancelled_at: "2026-10-03T13:00:00Z", needs_refund: false },
    ],
    sessions: [{ connection_id: "c-paid", amount_cents: 499, livemode: true, status: "CONSUMED", payment_status: "paid" }],
    charges: [
      { id: "s1", amount_cents: 999, status: "CONSUMED", payment_status: "paid", livemode: true, fulfilled_at: "2026-10-01T15:00:00Z", created_at: "2026-10-01T14:59:00Z", needs_refund: false },
    ],
    references: { p1: 1004 },
  });

  it("lists Connect payments with the PPP number, amount, date, and status, newest first", () => {
    expect(rows.map((row) => row.id)).toEqual(["connect-c-paid", "connect-c-cancel", "activation-s1"]);
    expect(rows[0]).toMatchObject({ label: "Connect", jobRef: "PPP-1004", amountCents: 499, status: "Paid", charged: true, testMode: false });
    expect(rows[1]).toMatchObject({ jobRef: null, status: "Cancelled · not charged", charged: false });
    expect(rows[2]).toMatchObject({ label: "Account activation", amountCents: 999, status: "Paid", charged: true });
  });

  it("totals only real charges", () => {
    expect(billingTotalChargedCents(rows)).toBe(499 + 999);
    const test = buildBillingRows({
      connections: [{ id: "t", project_id: null, status: "PAID", fee_cents: 499, paid_at: "2026-10-01T00:00:00Z", created_at: null, cancelled_at: null, needs_refund: false }],
      sessions: [{ connection_id: "t", amount_cents: 499, livemode: false, status: "CONSUMED", payment_status: "paid" }],
      charges: [],
      references: {},
    });
    expect(test[0].testMode).toBe(true);
    expect(billingTotalChargedCents(test)).toBe(0);
  });

  it("never carries contact fields into a row", () => {
    const keys = new Set(rows.flatMap((row) => Object.keys(row)));
    for (const forbidden of ["phone", "email", "street", "customer_id", "name", "title"]) {
      expect(keys.has(forbidden)).toBe(false);
    }
  });

  it("labels every connection and activation status", () => {
    expect(connectStatusLabel({ status: "RESERVED", paid_at: null, needs_refund: false }).status).toMatch(/not charged/);
    expect(connectStatusLabel({ status: "PAYMENT_DISABLED", paid_at: null, needs_refund: false }).charged).toBe(false);
    expect(connectStatusLabel({ status: "PAID", paid_at: "x", needs_refund: true }).status).toBe("Paid · refund under review");
    expect(connectStatusLabel({ status: "COMPLETED", paid_at: "x", needs_refund: false }).status).toBe("Paid · job completed");
    expect(activationChargeStatusLabel({ status: "OPEN", payment_status: null, needs_refund: false }).charged).toBe(false);
    expect(activationChargeStatusLabel({ status: "EXPIRED", payment_status: null, needs_refund: false }).status).toBe("Expired · not charged");
  });
});

describe("account activation text", () => {
  it("says a waived contractor or customer was not charged instead of 'Not required'", () => {
    expect(accountActivationText({ accountType: "CONTRACTOR", status: "NOT_REQUIRED", paidAt: null }).text).toBe(
      "Waived · no $9.99 activation charge on this account",
    );
    expect(accountActivationText({ accountType: "ADMIN", status: "NOT_REQUIRED", paidAt: null }).text).toBe("Not required for this role");
  });

  it("shows a paid $9.99 from the charge on file even when the profile flag disagrees", () => {
    expect(
      accountActivationText({ accountType: "CONTRACTOR", status: "NOT_REQUIRED", paidAt: null, paidChargeAt: "2026-10-01T15:00:00Z" }).text,
    ).toBe("Paid $9.99 on Oct 1, 2026");
    expect(accountActivationText({ accountType: "CONTRACTOR", status: "PAID", paidAt: "2026-10-02T15:00:00Z" }).text).toBe(
      "Paid $9.99 on Oct 2, 2026",
    );
  });

  it("offers Activate only while unpaid", () => {
    expect(accountActivationText({ accountType: "CONTRACTOR", status: "UNPAID", paidAt: null })).toEqual({
      text: "Not activated · $9.99 due",
      showActivate: true,
    });
  });
});
