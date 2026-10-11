/**
 * Live public prices for Priority Help.
 * The legacy basis-point contractor setting is intentionally not a field here.
 */

export type LivePricing = {
  signup_fee_cents: number | null;
  signup_fee_enabled: boolean;
  connection_fee_cents: number | null;
  connection_fee_enabled: boolean;
  payments_live: boolean;
  charges_live: boolean;
};

export function formatUsdFromCents(cents: number | null): string {
  if (cents == null || !Number.isFinite(cents) || cents < 0) return "the live amount is unavailable";
  return `$${(cents / 100).toFixed(2)}`;
}

export function formatLivePricing(pricing: LivePricing): string {
  const activation = formatUsdFromCents(pricing.signup_fee_cents);
  const connect = formatUsdFromCents(pricing.connection_fee_cents);
  const activationState = pricing.signup_fee_enabled ? "on" : "off";
  const connectState = pricing.connection_fee_enabled ? "on" : "off";
  const jobs = pricing.payments_live || pricing.charges_live ? "live" : "not live";
  return [
    "Live platform settings. Quote these amounts and no others.",
    `Account activation is a one-time fee for homeowners and contractors: ${activation}. Checkout is ${activationState}.`,
    `Contractor Connect, the contact unlock, is a one-time fee paid by the contractor: ${connect}. Checkout is ${connectState}.`,
    `Job payments through the platform are ${jobs}.`,
    "There is no commission.",
    "Do not mention a percentage contractor fee, a basis-point fee, or any amount that is not in this block.",
  ].join("\n");
}
