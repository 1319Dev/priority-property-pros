import { describe, expect, it } from "vitest";
import {
  achRecommendedCopy,
  allocateMarketplaceFee,
  assertStripeSecretIsTestMode,
  autoRefundDecision,
  autoReopenExpiredEstimates,
  abandonedBookingCreatesRelationship,
  abandonedBookingOwesFee,
  abandonedBookingUnlocksContact,
  buildPaymentSchedule,
  buildPaymentSuccessLedger,
  canApproveMilestone,
  canCreateStripeTransfer,
  canMarkMilestoneComplete,
  cancellationCategoryFor,
  cardConvenientCopy,
  changeOrderScheduleItem,
  checkoutDoesNotConfirmCopy,
  clientCanConfirmBooking,
  clientCanMarkPaymentSucceeded,
  clientCanSetFeeOrEarnings,
  clientRedirectIsNotAuthoritative,
  clientsCannotReplaceConnectedAccountId,
  clientsCannotSetAuthoritativeAmounts,
  clientsCannotWriteLedger,
  connectOnboardingModel,
  contractorCanMarketplaceParticipate,
  contractorCanReceiveTransfers,
  contractorCanSelfApproveMilestone,
  contractorPaysFeeCopy,
  customerCanPayBooking,
  DEFAULT_PAYMENT_POLICY,
  depositCents,
  displayTransferAsAvailable,
  distinguishDisputeKind,
  duplicateTransferBlocked,
  eligibilityAfterPayment,
  estimateStillSelectable,
  fakeArbitrationEnabled,
  heldMoneyIsNotAvailable,
  isStripeTestPublishableKey,
  ledgerCorrectionIsNewRow,
  mapConnectAccountStatus,
  noInstantPayoutCopy,
  paymentGuidanceForAmount,
  processStripeEventIdempotent,
  processingCostIsNotMarketplaceFee,
  redactWebhookLog,
  refundAmountValid,
  refundDeletesSuccessHistory,
  refundsAreServerSideOnly,
  requiredConfirmationItem,
  scheduleTotalsMatch,
  splitExact,
  STRIPE_WEBHOOK_EVENTS,
  transferAllowed,
  webhookSignatureIsMandatory,
} from "./index";

describe("payment schedule builder", () => {
  it("allows full pay under $1,000 and keeps totals exact", () => {
    const plan = buildPaymentSchedule(99_999);
    expect(plan.guidance).toBe("FULL_PAY_ALLOWED");
    expect(plan.items).toHaveLength(1);
    expect(plan.items[0]?.kind).toBe("FINAL_PAYMENT");
    expect(plan.items[0]?.due_now).toBe(true);
    expect(scheduleTotalsMatch(plan.items, 99_999)).toBe(true);
    expect(plan.amount_due_now_cents).toBe(99_999);
    expect(plan.charges_live).toBe(false);
    expect(plan.payments_live).toBe(false);
  });

  it("uses deposit + remaining from $1,000 through $4,999.99 with a 25% cap", () => {
    expect(paymentGuidanceForAmount(100_000)).toBe("DEPOSIT_PLUS_REMAINING");
    const plan = buildPaymentSchedule(400_000);
    expect(plan.guidance).toBe("DEPOSIT_PLUS_REMAINING");
    expect(plan.items.map((row) => row.kind)).toEqual(["BOOKING_DEPOSIT", "FINAL_PAYMENT"]);
    expect(plan.items[0]?.amount_cents).toBe(depositCents(400_000));
    expect(plan.items[0]?.amount_cents).toBe(100_000);
    expect(scheduleTotalsMatch(plan.items, 400_000)).toBe(true);
    expect(requiredConfirmationItem(plan.items)?.kind).toBe("BOOKING_DEPOSIT");
  });

  it("prefers milestones at $5,000+", () => {
    const plan = buildPaymentSchedule(500_000);
    expect(plan.guidance).toBe("MILESTONES_PREFERRED");
    expect(plan.items.map((row) => row.kind)).toEqual(["BOOKING_DEPOSIT", "MILESTONE", "FINAL_PAYMENT"]);
    expect(plan.items[1]?.requires_customer_approval).toBe(true);
    expect(scheduleTotalsMatch(plan.items, 500_000)).toBe(true);
  });

  it("splits odd cents without remainder", () => {
    expect(splitExact(100, [1, 1])).toEqual([50, 50]);
    expect(splitExact(101, [1, 1])).toEqual([50, 51]);
    expect(splitExact(5, [1, 1, 1])).toEqual([1, 1, 3]);
  });

  it("adds approved change orders as schedule items and ignores negative deltas", () => {
    expect(changeOrderScheduleItem(12_500, 4)?.kind).toBe("APPROVED_CHANGE_ORDER");
    expect(changeOrderScheduleItem(-500, 4)).toBeNull();
    expect(clientsCannotSetAuthoritativeAmounts()).toBe(true);
  });
});

describe("Connect Express mapping", () => {
  it("maps Stripe capabilities to PPP statuses", () => {
    expect(mapConnectAccountStatus(null)).toBe("NOT_STARTED");
    expect(
      mapConnectAccountStatus({
        details_submitted: false,
        charges_enabled: false,
        payouts_enabled: false,
        currently_due: [],
        transfers_capability: "unrequested",
      }),
    ).toBe("ONBOARDING");
    expect(
      mapConnectAccountStatus({
        details_submitted: true,
        charges_enabled: true,
        payouts_enabled: false,
        currently_due: ["individual.id_number"],
        transfers_capability: "pending",
      }),
    ).toBe("RESTRICTED");
    expect(
      mapConnectAccountStatus({
        details_submitted: true,
        charges_enabled: true,
        payouts_enabled: true,
        currently_due: [],
        transfers_capability: "active",
      }),
    ).toBe("READY");
    expect(
      mapConnectAccountStatus({
        details_submitted: true,
        charges_enabled: false,
        payouts_enabled: false,
        disabled: true,
        currently_due: [],
        transfers_capability: "inactive",
      }),
    ).toBe("DISABLED");
  });

  it("lets contractors participate before payouts and blocks transfers until READY", () => {
    expect(contractorCanMarketplaceParticipate("ONBOARDING")).toBe(true);
    expect(contractorCanReceiveTransfers("ONBOARDING")).toBe(false);
    expect(contractorCanReceiveTransfers("READY")).toBe(true);
    expect(contractorCanMarketplaceParticipate("DISABLED")).toBe(false);
    expect(connectOnboardingModel().type).toBe("express");
    expect(clientsCannotReplaceConnectedAccountId()).toBe(true);
  });
});

describe("verified webhooks", () => {
  const event = (id: string, type: string): Parameters<typeof processStripeEventIdempotent>[0]["event"] => ({
    id,
    type,
    created: 1,
    data: { object: { id: "pi_1" } },
  });

  it("requires signatures, is replay-safe, and ignores client redirects", () => {
    expect(webhookSignatureIsMandatory()).toBe(true);
    expect(clientRedirectIsNotAuthoritative()).toBe(true);
    expect(checkoutDoesNotConfirmCopy()).toMatch(/verified webhook/i);
    const processed = processStripeEventIdempotent({
      event: event("evt_1", "payment_intent.succeeded"),
      alreadyProcessedIds: new Set(),
    });
    expect(processed.status).toBe("processed");
    expect(processed.effects).toContain("maybe_confirm_booking");
    const dup = processStripeEventIdempotent({
      event: event("evt_1", "payment_intent.succeeded"),
      alreadyProcessedIds: new Set(["evt_1"]),
    });
    expect(dup.status).toBe("duplicate");
    expect(dup.effects).toEqual([]);
  });

  it("is out-of-order safe once a payment succeeded", () => {
    const lateFail = processStripeEventIdempotent({
      event: event("evt_2", "payment_intent.payment_failed"),
      alreadyProcessedIds: new Set(),
      itemStatus: "SUCCEEDED",
    });
    expect(lateFail.effects).toContain("ignore_stale_failure");
    const lateProcessing = processStripeEventIdempotent({
      event: event("evt_3", "payment_intent.processing"),
      alreadyProcessedIds: new Set(),
      itemStatus: "SUCCEEDED",
    });
    expect(lateProcessing.effects).toContain("ignore_stale_processing");
  });

  it("redacts PAN/bank fields from logs and lists subscribed events", () => {
    const redacted = redactWebhookLog({
      id: "evt",
      number: "4242424242424242",
      account_number: "000123456789",
      nested: { cvc: "123", ok: true },
    });
    expect(redacted.number).toBe("[redacted]");
    expect(redacted.account_number).toBe("[redacted]");
    expect((redacted.nested as { cvc: string }).cvc).toBe("[redacted]");
    expect((redacted.nested as { ok: boolean }).ok).toBe(true);
    expect(STRIPE_WEBHOOK_EVENTS).toContain("payment_intent.succeeded");
    expect(STRIPE_WEBHOOK_EVENTS).toContain("charge.dispute.created");
  });
});

describe("ledger", () => {
  it("records gross, processing cost, marketplace fee, and contractor gross as separate lines", () => {
    const rows = buildPaymentSuccessLedger({
      booking_id: "b1",
      schedule_item_id: "s1",
      payment_id: "p1",
      stripe_payment_intent_id: "pi_test",
      stripe_charge_id: "ch_test",
      stripe_balance_transaction_id: "txn_test",
      gross_cents: 100_000,
      processing_cost_cents: 320,
      marketplace_fee_cents: 7_500,
      fee_schedule_id: "sched",
    });
    expect(rows.map((row) => row.entry_type)).toEqual([
      "CUSTOMER_PAYMENT_GROSS",
      "PROCESSING_COST",
      "MARKETPLACE_FEE",
      "CONTRACTOR_GROSS",
    ]);
    expect(rows.find((row) => row.entry_type === "CONTRACTOR_GROSS")?.amount_cents).toBe(92_500);
    expect(processingCostIsNotMarketplaceFee()).toBe(true);
    expect(ledgerCorrectionIsNewRow()).toBe(true);
    expect(clientsCannotWriteLedger()).toBe(true);
  });

  it("true-ups marketplace fee on the last remaining item", () => {
    expect(
      allocateMarketplaceFee({
        item_amount_cents: 25_000,
        schedule_total_cents: 100_000,
        remaining_fee_cents: 7_500,
        remaining_items: 1,
      }),
    ).toBe(7_500);
  });
});

describe("authorization and transfers", () => {
  it("stops customers paying someone else's booking and contractors redirecting others' payouts", () => {
    expect(
      customerCanPayBooking({
        actorId: "cust-a",
        bookingCustomerId: "cust-b",
        bookingId: "b1",
        requestedBookingId: "b1",
      }),
    ).toBe(false);
    expect(
      customerCanPayBooking({
        actorId: "cust-a",
        bookingCustomerId: "cust-a",
        bookingId: "b1",
        requestedBookingId: "b1",
      }),
    ).toBe(true);
    expect(clientCanSetFeeOrEarnings()).toBe(false);
    expect(clientCanMarkPaymentSucceeded()).toBe(false);
    expect(clientCanConfirmBooking()).toBe(false);
  });

  it("requires READY + ELIGIBLE and prevents duplicate transfers", () => {
    expect(
      transferAllowed({
        connectStatus: "READY",
        transferStatus: "ELIGIBLE",
        itemStatus: "SUCCEEDED",
        held: false,
      }),
    ).toBe(true);
    expect(
      transferAllowed({
        connectStatus: "ONBOARDING",
        transferStatus: "ELIGIBLE",
        itemStatus: "SUCCEEDED",
        held: false,
      }),
    ).toBe(false);
    expect(duplicateTransferBlocked("tr_123")).toBe(true);
    expect(heldMoneyIsNotAvailable("HELD")).toBe(true);
    expect(displayTransferAsAvailable("PENDING")).toBe(false);
    expect(displayTransferAsAvailable("TRANSFERRED")).toBe(true);
    expect(
      canCreateStripeTransfer({ status: "ELIGIBLE", connectStatus: "READY", existingStripeTransferId: null }),
    ).toBe(true);
    expect(eligibilityAfterPayment({
      kind: "BOOKING_DEPOSIT",
      bookingConfirmed: true,
      milestoneApproved: false,
      bookingCompleted: false,
      disputed: false,
    })).toBe("ELIGIBLE");
    expect(eligibilityAfterPayment({
      kind: "MILESTONE",
      bookingConfirmed: true,
      milestoneApproved: false,
      bookingCompleted: false,
      disputed: false,
    })).toBe("PENDING");
  });
});

describe("milestones, refunds, disputes, cancellations", () => {
  it("forbids contractor self-approval of customer-required milestones", () => {
    expect(contractorCanSelfApproveMilestone()).toBe(false);
    expect(
      canMarkMilestoneComplete({ actor: "CONTRACTOR", kind: "MILESTONE", status: "SCHEDULED" }),
    ).toBe(true);
    expect(
      canApproveMilestone({
        actor: "CONTRACTOR",
        kind: "MILESTONE",
        contractorCompleted: true,
        alreadyApproved: false,
      }),
    ).toBe(false);
    expect(
      canApproveMilestone({
        actor: "CUSTOMER",
        kind: "MILESTONE",
        contractorCompleted: true,
        alreadyApproved: false,
      }),
    ).toBe(true);
  });

  it("does not auto-decide complex refunds and never deletes success history", () => {
    expect(refundDeletesSuccessHistory()).toBe(false);
    expect(refundsAreServerSideOnly()).toBe(true);
    expect(refundAmountValid({ refund_cents: 50, captured_cents: 100, already_refunded_cents: 20 })).toBe(true);
    expect(refundAmountValid({ refund_cents: 90, captured_cents: 100, already_refunded_cents: 20 })).toBe(false);
    expect(autoRefundDecision("AFTER_WORK_STARTED")).toBe("PENDING_REVIEW");
    expect(autoRefundDecision("BEFORE_PAYMENT")).toBe("NONE");
  });

  it("holds funds on Stripe chargebacks and does not invent arbitration", () => {
    expect(distinguishDisputeKind("stripe")).toBe("STRIPE_CHARGEBACK");
    expect(distinguishDisputeKind("ppp")).toBe("PPP_PROJECT");
    expect(fakeArbitrationEnabled()).toBe(false);
  });

  it("abandons pending selection without contact, relationship, or fee, and does not reopen expired estimates", () => {
    expect(abandonedBookingCreatesRelationship()).toBe(false);
    expect(abandonedBookingUnlocksContact()).toBe(false);
    expect(abandonedBookingOwesFee()).toBe(false);
    expect(autoReopenExpiredEstimates()).toBe(false);
    expect(estimateStillSelectable({ status: "SUBMITTED", validUntil: null })).toBe(true);
    expect(estimateStillSelectable({ status: "SUBMITTED", validUntil: "2000-01-01T00:00:00Z" })).toBe(false);
    expect(estimateStillSelectable({ status: "EXPIRED", validUntil: null })).toBe(false);
    expect(
      cancellationCategoryFor({
        bookingStatus: "PENDING",
        hasSucceededPayment: false,
        workStarted: false,
        hasMilestonePayment: false,
        initiator: "CUSTOMER",
      }),
    ).toBe("BEFORE_PAYMENT");
  });
});

describe("copy and test-mode keys", () => {
  it("recommends ACH without settlement-timing claims and keeps fee contractor-paid", () => {
    expect(achRecommendedCopy()).toMatch(/Recommended for larger project payments/);
    expect(cardConvenientCopy()).toMatch(/Fast and convenient/);
    expect(contractorPaysFeeCopy()).toMatch(/not added as a customer checkout surcharge/);
    expect(noInstantPayoutCopy()).toMatch(/not immediately withdrawable/);
    expect(noInstantPayoutCopy()).not.toMatch(/instant payout/i);
  });

  it("accepts only test publishable keys and rejects live or secret keys", () => {
    expect(isStripeTestPublishableKey("pk_test_1234567890abcdef")).toBe(true);
    expect(isStripeTestPublishableKey("pk_live_1234567890abcdef")).toBe(false);
    expect(isStripeTestPublishableKey("sk_test_1234567890abcdef")).toBe(false);
    expect(isStripeTestPublishableKey("pk_test_your_publishable_key")).toBe(false);
    expect(() => assertStripeSecretIsTestMode("sk_live_abc")).toThrow(/live keys are forbidden/i);
    expect(() => assertStripeSecretIsTestMode("sk_test_abc")).not.toThrow();
    expect(DEFAULT_PAYMENT_POLICY.charges_live).toBe(false);
    expect(DEFAULT_PAYMENT_POLICY.payments_live).toBe(false);
  });
});
