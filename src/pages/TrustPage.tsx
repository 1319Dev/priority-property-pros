import { useHidePlatformPricing } from "../lib/auth/platformPricing";
import { ComingSoonLayout } from "./ComingSoonLayout";

const TRUST_BEFORE_FEES =
  "PPP is a technology marketplace that facilitates connections between customers and independent contractors. PPP does not employ contractors, perform the work, guarantee hiring or workmanship, process project payments, or take a percentage of project payment under this model.";

const TRUST_FEES = " The $9.99 account activation fee and the $4.99 Connection Fee are non-refundable.";

const TRUST_AFTER_FEES =
  " PPP does not currently verify licenses, insurance, or workmanship. Admin contractor approval is not workmanship verification. Hire like a careful neighbor: ask, document, and walk away if it feels wrong. Pre-connection circumvention of contact sharing is prohibited, with graduated enforcement (warning, suspension, or termination for repeated abuse — not an automatic permanent ban on one detection).";

export function TrustPage() {
  const hidePricing = useHidePlatformPricing();
  return (
    <ComingSoonLayout
      eyebrow="Trust & safety"
      title="We would rather under-claim than over-promise."
      body={`${TRUST_BEFORE_FEES}${hidePricing ? "" : TRUST_FEES}${TRUST_AFTER_FEES}`}
    />
  );
}
