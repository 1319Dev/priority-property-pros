import type { ConnectAccountSnapshot, ConnectAccountStatus } from "./types";

export function mapConnectAccountStatus(snapshot: ConnectAccountSnapshot | null | undefined): ConnectAccountStatus {
  if (!snapshot) return "NOT_STARTED";
  if (snapshot.disabled) return "DISABLED";
  if (snapshot.payouts_enabled && snapshot.transfers_capability === "active" && snapshot.charges_enabled) {
    return "READY";
  }
  if (snapshot.details_submitted) return "RESTRICTED";
  return "ONBOARDING";
}

export function contractorCanReceiveTransfers(status: ConnectAccountStatus): boolean {
  return status === "READY";
}

export function contractorCanMarketplaceParticipate(status: ConnectAccountStatus): boolean {
  return status !== "DISABLED";
}

export function clientsCannotReplaceConnectedAccountId(): boolean {
  return true;
}

export function connectOnboardingModel(): {
  type: "express";
  reason: string;
  hosted: true;
} {
  return {
    type: "express",
    hosted: true,
    reason:
      "Stripe Connect Express with hosted Account Links is the cleanest marketplace fit: PPP is the platform, contractors complete Stripe-hosted KYC, and payouts use transfers from the platform account.",
  };
}
