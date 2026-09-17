import type { DisputeKind, TransferStatus } from "./types";

export function disputeHoldsTransfers(): boolean {
  return true;
}

export function transferStatusOnStripeChargeback(): TransferStatus {
  return "HELD";
}

export function distinguishDisputeKind(source: "stripe" | "ppp"): DisputeKind {
  return source === "stripe" ? "STRIPE_CHARGEBACK" : "PPP_PROJECT";
}

export function fakeArbitrationEnabled(): boolean {
  return false;
}
