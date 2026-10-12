import { cn } from "../../utils/cn";

/**
 * Short refund notice shown right next to a platform-fee pay button, before
 * the person is sent to Stripe Checkout. Copy only: it does not change any fee,
 * checkout, or refund behavior. Wording matches the Refund & Cancellation Policy.
 */
export const ACTIVATION_REFUND_NOTICE_TEXT =
  "This activation fee is generally non-refundable once delivered, except duplicate or erroneous charges, refunds required by law, or approved exceptions.";

export const CONNECTION_REFUND_NOTICE_TEXT =
  "This Connection Fee is non-refundable once the connection is delivered. If you are charged but the connection can't be provided, it is refunded automatically.";

/** Back-compat name for the activation notice. */
export const CHECKOUT_REFUND_NOTICE_TEXT = ACTIVATION_REFUND_NOTICE_TEXT;

export const REFUND_POLICY_PATH = "/refunds";
export const REFUND_POLICY_LABEL = "Refund & Cancellation Policy";

export type CheckoutRefundFee = "activation" | "connection";

export function CheckoutRefundNotice({ className, fee = "activation" }: { className?: string; fee?: CheckoutRefundFee }) {
  return (
    <p
      role="note"
      data-testid="checkout-refund-notice"
      className={cn(
        "rounded-2xl border border-gold-500/60 bg-cream-100 px-4 py-3 text-sm font-medium leading-relaxed text-ink-900",
        className,
      )}
    >
      {fee === "connection" ? CONNECTION_REFUND_NOTICE_TEXT : ACTIVATION_REFUND_NOTICE_TEXT}{" "}
      See the{" "}
      <a href={REFUND_POLICY_PATH} className="font-semibold text-forest-800 underline underline-offset-2">
        {REFUND_POLICY_LABEL}
      </a>
      .
    </p>
  );
}
