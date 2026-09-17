import { formatUsdFromCents } from "../../lib/marketplace/fees";
import {
  achRecommendedCopy,
  cardConvenientCopy,
  checkoutDoesNotConfirmCopy,
  contractorPaysFeeCopy,
} from "../../lib/payments/schedules";
import type { PaymentScheduleItem } from "../../lib/payments/types";
import { Button } from "../ui/Button";

export function PaymentScheduleList({
  items,
  amountDueNow,
  onPay,
  onApproveMilestone,
  payingId,
  canPay,
}: {
  items: PaymentScheduleItem[];
  amountDueNow: number;
  onPay?: (item: PaymentScheduleItem) => void;
  onApproveMilestone?: (item: PaymentScheduleItem) => void;
  payingId?: string | null;
  canPay?: boolean;
}) {
  return (
    <section className="space-y-3 rounded-3xl border border-forest-800/10 bg-cream-50 px-5 py-4">
      <h2 className="font-display text-2xl text-forest-800">Payment schedule</h2>
      <p className="text-sm text-ink-700">{contractorPaysFeeCopy()}</p>
      <p className="text-sm font-semibold text-forest-800">Due now: {formatUsdFromCents(amountDueNow)}</p>
      <ul className="space-y-2 text-sm">
        {items.map((item) => {
          const payable = canPay && ["DUE", "PENDING", "FAILED", "PROCESSING"].includes(item.status) && item.amount_cents > 0;
          return (
            <li key={item.id} className="rounded-2xl border border-forest-800/10 px-4 py-3">
              <p className="font-semibold">
                {item.kind.replaceAll("_", " ")} · {formatUsdFromCents(item.amount_cents)}
              </p>
              <p>{item.description}</p>
              <p className="text-ink-500">{item.status.replaceAll("_", " ")}</p>
              {payable && onPay ? (
                <Button
                  type="button"
                  className="mt-2 min-h-12 w-full"
                  disabled={payingId === item.id}
                  onClick={() => onPay(item)}
                >
                  {payingId === item.id ? "Starting Stripe test checkout…" : "Pay this amount (test mode)"}
                </Button>
              ) : null}
              {onApproveMilestone &&
              item.kind === "MILESTONE" &&
              item.contractor_completed_at &&
              !item.customer_approved_at ? (
                <Button type="button" variant="outline" className="mt-2 min-h-12 w-full" onClick={() => onApproveMilestone(item)}>
                  Approve this milestone
                </Button>
              ) : null}
            </li>
          );
        })}
      </ul>
      {canPay ? (
        <div className="space-y-1 text-xs text-ink-500">
          <p>{achRecommendedCopy()}</p>
          <p>{cardConvenientCopy()}</p>
          <p>{checkoutDoesNotConfirmCopy()}</p>
        </div>
      ) : null}
    </section>
  );
}

export function TransferStatusList({
  rows,
}: {
  rows: Array<{ id: string; amount_cents: number; status: string; held_reason?: string | null }>;
}) {
  return (
    <section className="space-y-2 rounded-3xl border border-forest-800/10 px-5 py-4">
      <h2 className="font-display text-2xl text-forest-800">Transfers</h2>
      <p className="text-sm text-ink-700">Held or pending amounts are not available to withdraw. This is not a same-day withdrawal.</p>
      {rows.length === 0 ? (
        <p className="text-sm text-ink-500">No transfer rows yet.</p>
      ) : (
        <ul className="space-y-2 text-sm">
          {rows.map((row) => (
            <li key={row.id} className="rounded-2xl bg-cream-100 px-4 py-3">
              <p className="font-semibold">
                {formatUsdFromCents(row.amount_cents)} · {row.status.replaceAll("_", " ")}
              </p>
              {row.status === "TRANSFERRED" ? (
                <p>Available / transferred</p>
              ) : (
                <p className="text-ink-500">Not available{row.held_reason ? ` (${row.held_reason})` : ""}</p>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
