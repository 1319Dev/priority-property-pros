import { describe, expect, it, vi } from "vitest";
import {
  acceptFailureBlocksConnect,
  canContractorEndJob,
  connectRequiresSeparateParticipate,
  contractorEndJobPlan,
  endJobConfirmBody,
  opportunityAllowsConnectCta,
  runContractorConnect,
  shouldAcceptOpportunityOnConnect,
  CONNECT_SINGLE_STEP_COPY,
  END_JOB_BODY_PAID,
  END_JOB_BODY_UNPAID,
  END_JOB_BUTTON_LABEL,
} from "./contractorJobActions";

describe("single Connect flow", () => {
  it("does not require a separate Participate click", () => {
    expect(connectRequiresSeparateParticipate()).toBe(false);
    expect(opportunityAllowsConnectCta("AVAILABLE")).toBe(true);
    expect(opportunityAllowsConnectCta("ACCEPTED")).toBe(true);
    expect(opportunityAllowsConnectCta("PASSED")).toBe(false);
    expect(shouldAcceptOpportunityOnConnect("AVAILABLE")).toBe(true);
    expect(shouldAcceptOpportunityOnConnect("ACCEPTED")).toBe(false);
    expect(CONNECT_SINGLE_STEP_COPY).toMatch(/do not need a separate Participate step/i);
  });

  it("accepts AVAILABLE then connects, and still connects if accept is optional-full", async () => {
    const accept = vi.fn().mockResolvedValue({ participating: 1 });
    const requestConnection = vi.fn().mockResolvedValue(undefined);
    await runContractorConnect({
      opportunityStatus: "AVAILABLE",
      accept,
      checkoutEnabled: false,
      startCheckout: async () => {
        throw new Error("checkout should not run");
      },
      requestConnection,
    });
    expect(accept).toHaveBeenCalledTimes(1);
    expect(requestConnection).toHaveBeenCalledTimes(1);

    const acceptFull = vi.fn().mockRejectedValue(new Error("this project already has 3 participating contractors"));
    const requestAfterFull = vi.fn().mockResolvedValue(undefined);
    await runContractorConnect({
      opportunityStatus: "AVAILABLE",
      accept: acceptFull,
      checkoutEnabled: false,
      startCheckout: async () => undefined,
      requestConnection: requestAfterFull,
    });
    expect(requestAfterFull).toHaveBeenCalledTimes(1);
  });

  it("skips accept when already ACCEPTED and uses checkout when enabled", async () => {
    const accept = vi.fn();
    const startCheckout = vi.fn().mockResolvedValue(undefined);
    await runContractorConnect({
      opportunityStatus: "ACCEPTED",
      accept,
      checkoutEnabled: true,
      startCheckout,
      requestConnection: async () => {
        throw new Error("payments-off request should not run");
      },
    });
    expect(accept).not.toHaveBeenCalled();
    expect(startCheckout).toHaveBeenCalledTimes(1);
  });

  it("blocks Connect only when accept fails as an auth/ownership error", () => {
    expect(acceptFailureBlocksConnect("not your opportunity")).toBe(true);
    expect(acceptFailureBlocksConnect("auth required")).toBe(true);
    expect(acceptFailureBlocksConnect("this project already has 3 participating contractors")).toBe(false);
    expect(acceptFailureBlocksConnect("opportunity is not available")).toBe(false);
  });
});

describe("End this job plan", () => {
  it("passes an unused AVAILABLE job without touching slots or contact", () => {
    expect(canContractorEndJob({ opportunityStatus: "AVAILABLE" })).toBe(true);
    expect(contractorEndJobPlan({ opportunityStatus: "AVAILABLE" })).toEqual({
      opportunityStatus: "PASSED",
      connectionStatus: null,
      releaseConnectionSlot: false,
      releaseOpportunitySlot: false,
      withdrawOpenEstimates: false,
      contactUnlocked: false,
    });
    expect(endJobConfirmBody(null)).toBe(END_JOB_BODY_UNPAID);
    expect(END_JOB_BUTTON_LABEL).toBe("End this job");
  });

  it("cancels unpaid occupying connections and frees the connection slot", () => {
    for (const status of ["INITIATED", "RESERVED", "PAYMENT_DISABLED"] as const) {
      const plan = contractorEndJobPlan({
        opportunityStatus: "ACCEPTED",
        connectionStatus: status,
      });
      expect(plan.connectionStatus).toBe("CANCELLED");
      expect(plan.opportunityStatus).toBe("PASSED");
      expect(plan.releaseConnectionSlot).toBe(true);
      expect(plan.releaseOpportunitySlot).toBe(true);
      expect(plan.withdrawOpenEstimates).toBe(true);
      expect(plan.contactUnlocked).toBe(false);
    }
  });

  it("completes a paid connection without freeing the paid slot or granting contact", () => {
    const plan = contractorEndJobPlan({
      opportunityStatus: "ACCEPTED",
      connectionStatus: "PAID",
    });
    expect(plan).toEqual({
      opportunityStatus: "CLOSED",
      connectionStatus: "COMPLETED",
      releaseConnectionSlot: false,
      releaseOpportunitySlot: true,
      withdrawOpenEstimates: true,
      contactUnlocked: false,
    });
    expect(endJobConfirmBody("PAID")).toBe(END_JOB_BODY_PAID);
  });

  it("refuses to unwind a hire unless the paid connection is only being completed", () => {
    expect(
      canContractorEndJob({
        opportunityStatus: "ACCEPTED",
        hasActiveBooking: true,
        connectionStatus: "PAYMENT_DISABLED",
      }),
    ).toBe(false);
    expect(
      contractorEndJobPlan({
        opportunityStatus: "ACCEPTED",
        hasActiveBooking: true,
        connectionStatus: "PAYMENT_DISABLED",
      }).refuseReason,
    ).toMatch(/already in a booking/i);
    expect(
      contractorEndJobPlan({
        opportunityStatus: "ACCEPTED",
        hasActiveBooking: true,
        connectionStatus: "PAID",
      }),
    ).toEqual({
      opportunityStatus: "ACCEPTED",
      connectionStatus: "COMPLETED",
      releaseConnectionSlot: false,
      releaseOpportunitySlot: false,
      withdrawOpenEstimates: false,
      contactUnlocked: false,
    });
  });
});
