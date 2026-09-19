import type { OpportunityStatus, ProjectConnectionStatus, ProjectStatus } from "./types";

export const CONNECT_SINGLE_STEP_COPY =
  "Tap Connect to take this job. You do not need a separate Participate step.";

export const END_JOB_BUTTON_LABEL = "End this job";
export const END_JOB_TITLE = "End this job?";
export const END_JOB_CONFIRM = "End this job";
export const END_JOB_CANCEL = "Keep this job";
export const END_JOB_BODY_UNPAID =
  "This removes the job from your active list. Unpaid connection spots are freed for other pros. History is kept. Contact stays locked. This cannot be undone from here.";
export const END_JOB_BODY_PAID =
  "This marks your connection complete and removes the job from your active list. A paid $4.99 spot stays used. Contact stays available only if a paid or admin entitlement already exists. This cannot be undone from here.";

export const ACTIVE_BOOKING_STATUSES = [
  "PENDING",
  "AWAITING_PAYMENT",
  "CONFIRMED",
  "IN_PROGRESS",
] as const;

export type ContractorEndJobPlan = {
  opportunityStatus: "PASSED" | "CLOSED" | OpportunityStatus;
  connectionStatus: "CANCELLED" | "COMPLETED" | ProjectConnectionStatus | null;
  releaseConnectionSlot: boolean;
  releaseOpportunitySlot: boolean;
  withdrawOpenEstimates: boolean;
  contactUnlocked: false;
  refuseReason?: string;
};

export function connectRequiresSeparateParticipate(): boolean {
  return false;
}

export function opportunityAllowsConnectCta(status: OpportunityStatus | null | undefined): boolean {
  return status === "AVAILABLE" || status === "ACCEPTED";
}

export function shouldAcceptOpportunityOnConnect(status: OpportunityStatus | null | undefined): boolean {
  return status === "AVAILABLE";
}

export function acceptFailureBlocksConnect(message: string | null | undefined): boolean {
  const text = (message ?? "").toLowerCase();
  if (!text) return false;
  return text.includes("not your opportunity") || text.includes("auth required");
}

export async function runContractorConnect(input: {
  opportunityStatus: OpportunityStatus;
  accept: () => Promise<unknown>;
  checkoutEnabled: boolean;
  startCheckout: () => Promise<void>;
  requestConnection: () => Promise<void>;
}): Promise<void> {
  if (shouldAcceptOpportunityOnConnect(input.opportunityStatus)) {
    try {
      await input.accept();
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      if (acceptFailureBlocksConnect(message)) throw err;
    }
  }
  if (input.checkoutEnabled) {
    await input.startCheckout();
    return;
  }
  await input.requestConnection();
}

export function canContractorEndJob(input: {
  opportunityStatus: OpportunityStatus;
  projectStatus?: ProjectStatus | null;
  connectionStatus?: ProjectConnectionStatus | null;
  hasActiveBooking?: boolean;
}): boolean {
  if (input.projectStatus === "CANCELLED") return false;
  if (input.hasActiveBooking) return input.connectionStatus === "PAID";
  return opportunityAllowsConnectCta(input.opportunityStatus);
}

export function endJobConfirmBody(connectionStatus?: ProjectConnectionStatus | null): string {
  if (connectionStatus === "PAID" || connectionStatus === "COMPLETED") return END_JOB_BODY_PAID;
  return END_JOB_BODY_UNPAID;
}

export function contractorEndJobPlan(input: {
  opportunityStatus: OpportunityStatus;
  connectionStatus?: ProjectConnectionStatus | null;
  hasActiveBooking?: boolean;
  estimateAccepted?: boolean;
}): ContractorEndJobPlan {
  const connection = input.connectionStatus ?? null;
  const hired = Boolean(input.hasActiveBooking || input.estimateAccepted);

  if (hired && connection !== "PAID") {
    return {
      opportunityStatus: input.opportunityStatus,
      connectionStatus: connection,
      releaseConnectionSlot: false,
      releaseOpportunitySlot: false,
      withdrawOpenEstimates: false,
      contactUnlocked: false,
      refuseReason: "this job is already in a booking — complete it from Bookings",
    };
  }

  if (hired && connection === "PAID") {
    return {
      opportunityStatus: input.opportunityStatus,
      connectionStatus: "COMPLETED",
      releaseConnectionSlot: false,
      releaseOpportunitySlot: false,
      withdrawOpenEstimates: false,
      contactUnlocked: false,
    };
  }

  const unpaidOccupying =
    connection === "INITIATED" || connection === "RESERVED" || connection === "PAYMENT_DISABLED";

  if (unpaidOccupying) {
    return {
      opportunityStatus: "PASSED",
      connectionStatus: "CANCELLED",
      releaseConnectionSlot: true,
      releaseOpportunitySlot: input.opportunityStatus === "ACCEPTED",
      withdrawOpenEstimates: input.opportunityStatus === "ACCEPTED",
      contactUnlocked: false,
    };
  }

  if (connection === "PAID") {
    return {
      opportunityStatus: "CLOSED",
      connectionStatus: "COMPLETED",
      releaseConnectionSlot: false,
      releaseOpportunitySlot: input.opportunityStatus === "ACCEPTED",
      withdrawOpenEstimates: input.opportunityStatus === "ACCEPTED",
      contactUnlocked: false,
    };
  }

  return {
    opportunityStatus: "PASSED",
    connectionStatus: connection,
    releaseConnectionSlot: false,
    releaseOpportunitySlot: input.opportunityStatus === "ACCEPTED",
    withdrawOpenEstimates: input.opportunityStatus === "ACCEPTED",
    contactUnlocked: false,
  };
}
