import { useEffect, useState } from "react";
import { Link, useParams, useSearchParams } from "react-router-dom";
import { PaymentScheduleList } from "../../../components/payments/SchedulePanel";
import { ButtonLink } from "../../../components/ui/Button";
import { FormError } from "../../../lib/auth/AuthCard";
import { checkoutDoesNotConfirmCopy } from "../../../lib/payments/schedules";
import { approveMilestone, fetchBookingPaymentOverview, fetchScheduleItems, startTestCheckout } from "../../../lib/payments/api";
import type { PaymentScheduleItem } from "../../../lib/payments/types";

export function CustomerPaymentReturnPage() {
  const { bookingId = "" } = useParams();
  const [params] = useSearchParams();
  const session = params.get("session");
  return (
    <div className="space-y-6">
      <h1 className="font-display text-4xl font-semibold text-forest-800">
        {session === "cancel" ? "Checkout cancelled" : "Payment submitted"}
      </h1>
      <p className="rounded-3xl bg-cream-100 px-5 py-4 text-sm font-semibold text-forest-800">
        {checkoutDoesNotConfirmCopy()} Stripe test mode is not live money.
      </p>
      <ButtonLink to={`/app/customer/bookings/${bookingId}`} className="min-h-14 w-full">
        Back to booking
      </ButtonLink>
    </div>
  );
}

export function CustomerPayPanel({ bookingId, canPay }: { bookingId: string; canPay: boolean }) {
  const [items, setItems] = useState<PaymentScheduleItem[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [payingId, setPayingId] = useState<string | null>(null);

  async function reload() {
    await fetchBookingPaymentOverview(bookingId);
    setItems(await fetchScheduleItems(bookingId));
  }

  useEffect(() => {
    void reload().catch((err: Error) => setError(err.message));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bookingId]);

  async function pay(item: PaymentScheduleItem) {
    setPayingId(item.id);
    setError(null);
    try {
      const result = await startTestCheckout(bookingId, item.id);
      const url = String(result.checkout_url ?? "");
      if (!url) throw new Error("Stripe test checkout did not return a URL. Check Edge Function secrets.");
      window.location.assign(url);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not start checkout.");
      setPayingId(null);
    }
  }

  async function approve(item: PaymentScheduleItem) {
    setError(null);
    try {
      await approveMilestone(item.id);
      await reload();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not approve the milestone.");
    }
  }

  const amountDueNow = items
    .filter((item) => item.due_now && ["DUE", "PENDING", "FAILED", "PROCESSING"].includes(item.status))
    .reduce((sum, item) => sum + item.amount_cents, 0);

  return (
    <div className="space-y-3">
      <FormError message={error} />
      <PaymentScheduleList
        items={items}
        amountDueNow={amountDueNow}
        canPay={canPay}
        payingId={payingId}
        onPay={canPay ? pay : undefined}
        onApproveMilestone={approve}
      />
      <p className="text-xs text-ink-500">
        Need another estimate instead? Cancel this unpaid booking — contact stays private and no marketplace fee is owed.{" "}
        <Link className="underline" to={`/app/customer/bookings/${bookingId}`}>
          Booking details
        </Link>
      </p>
    </div>
  );
}
