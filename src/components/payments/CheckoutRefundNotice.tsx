import { cn } from "../../utils/cn";

/**
 * Short refund notice shown right next to a platform-fee pay button, before
 * the person is sent to Stripe Checkout. Copy only: it does not change any fee,
 * checkout, or refund behavior.
 */
export const CHECKOUT_REFUND_NOTICE_TEXT =
  "Fees are generally non-refundable once delivered, except duplicate or erroneous charges, refunds required by law, or approved exceptions.";

export const REFUND_POLICY_PATH = "/refunds";

export function CheckoutRefundNotice({ className }: { className?: string }) {
  return (
    <p
      role="note"
      data-testid="checkout-refund-notice"
      className={cn(
        "rounded-2xl border border-gold-500/60 bg-cream-100 px-4 py-3 text-sm font-medium leading-relaxed text-ink-900",
        className,
      )}
    >
      {CHECKOUT_REFUND_NOTICE_TEXT}{" "}
      See{" "}
      <a href={REFUND_POLICY_PATH} className="font-semibold text-forest-800 underline underline-offset-2">
        Refund Policy
      </a>
      .
    </p>
  );
}
