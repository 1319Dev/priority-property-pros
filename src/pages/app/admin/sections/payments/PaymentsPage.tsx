import { useEffect, useState } from "react";
import { AdminFilterField, adminFieldClass } from "../../../../../components/admin/shell/AdminFilters";
import { AdminIncludeTestToggle, AdminPageHeader, initialIncludeTest } from "../../../../../components/admin/shell/AdminPageHeader";
import { AdminStatusPill } from "../../../../../components/admin/shell/AdminStatusPill";
import { ErrorState } from "../../../../../components/ui/PageState";
import { Skeleton } from "../../../../../components/ui/Skeleton";
import {
  fetchPayments,
  fetchPaymentsSummary,
  type PaymentFilters,
  type PaymentRow,
  type PaymentsSummary,
} from "../../../../../lib/admin/paymentsApi";
import { formatCents, formatCentralTimestamp } from "../../../../../lib/admin/money";
import { formatProjectReference } from "../../../../../lib/marketplace/projectReference";

const EMPTY: Omit<PaymentFilters, "includeTest"> = {
  query: "",
  kind: "",
  status: "",
  failedOnly: false,
};

export function PaymentsPage() {
  const [includeTest, setIncludeTest] = useState(initialIncludeTest);
  const [filters, setFilters] = useState(EMPTY);
  const [rows, setRows] = useState<PaymentRow[] | null>(null);
  const [total, setTotal] = useState(0);
  const [summary, setSummary] = useState<PaymentsSummary | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setError(null);
    void Promise.all([fetchPayments({ ...filters, includeTest }), fetchPaymentsSummary(includeTest)])
      .then(([list, money]) => {
        if (cancelled) return;
        setRows(list.rows);
        setTotal(list.total);
        setSummary(money);
      })
      .catch((reason: unknown) => {
        if (cancelled) return;
        setRows([]);
        setSummary(null);
        setError(reason instanceof Error ? reason.message : "Could not load payments.");
      });
    return () => {
      cancelled = true;
    };
  }, [filters, includeTest]);

  return (
    <div className="min-w-0 space-y-6">
      <AdminPageHeader
        title="Payments"
        description="Activation and Connect payments. This screen only reads them."
        actions={<AdminIncludeTestToggle checked={includeTest} onChange={setIncludeTest} />}
      />
      <section className="rounded-3xl border border-forest-800/10 bg-cream-50 px-4 py-4" aria-label="Net revenue">
        <p className="text-xs font-semibold uppercase tracking-[0.16em] text-gold-700">Net revenue</p>
        <p className="mt-2 font-display text-3xl font-semibold text-forest-800">
          {summary ? formatCents(summary.netCents) : "—"}
        </p>
        <p className="mt-2 max-w-2xl text-sm text-ink-700">
          {summary?.definition ||
            "Net revenue is livemode activation and Connect payments in PAID or CONSUMED, minus completed refund amounts."}
        </p>
        {summary ? (
          <p className="mt-2 text-sm text-ink-700">
            Gross {formatCents(summary.grossCents)} · stored refunds {formatCents(summary.refundedCents)} · needs-refund flags{" "}
            {summary.needsRefundCount.toLocaleString("en-US")} (not subtracted)
          </p>
        ) : null}
        <p className="mt-2 text-sm text-ink-500">Card declines are not recorded. Expired checkouts are not failed payments.</p>
      </section>
      <div className="grid gap-3 sm:grid-cols-2">
        <AdminFilterField label="Name, email, or id">
          <input
            className={adminFieldClass}
            aria-label="Payment search"
            value={filters.query}
            onChange={(event) => setFilters((current) => ({ ...current, query: event.target.value }))}
          />
        </AdminFilterField>
        <AdminFilterField label="Kind">
          <select
            className={adminFieldClass}
            aria-label="Payment kind"
            value={filters.kind}
            onChange={(event) =>
              setFilters((current) => ({ ...current, kind: event.target.value as PaymentFilters["kind"] }))
            }
          >
            <option value="">All</option>
            <option value="activation">Activation</option>
            <option value="connect">Connect</option>
          </select>
        </AdminFilterField>
        <AdminFilterField label="Status">
          <input
            className={adminFieldClass}
            aria-label="Payment status"
            value={filters.status}
            onChange={(event) => setFilters((current) => ({ ...current, status: event.target.value }))}
          />
        </AdminFilterField>
        <label className="flex min-h-11 items-center gap-2 self-end text-sm font-semibold text-forest-800">
          <input
            type="checkbox"
            className="size-4 accent-forest-800"
            checked={filters.failedOnly}
            onChange={(event) => setFilters((current) => ({ ...current, failedOnly: event.target.checked }))}
          />
          Failed payments
        </label>
      </div>
      {error ? <ErrorState message={error} /> : null}
      {rows == null && !error ? <Skeleton className="h-40" /> : null}
      {rows != null ? (
        <ul className="space-y-3" aria-label="Payments">
          {rows.map((row) => {
            const reference = formatProjectReference(row.referenceNumber);
            return (
              <li key={row.paymentId} className="rounded-3xl border border-forest-800/10 bg-cream-50 px-4 py-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="font-semibold text-forest-800">{row.partyName}</p>
                  <AdminStatusPill label={row.status} />
                </div>
                <p className="mt-1 text-sm text-ink-700">
                  {row.kind === "connect" ? "Connect" : "Activation"} · {formatCents(row.amountCents)}
                  {row.livemode ? "" : " · Test mode"}
                  {row.businessName ? ` · ${row.businessName}` : ""}
                  {reference ? ` · ${reference}` : ""}
                </p>
                <p className="text-sm text-ink-700">Refunds {formatCents(row.refundedCents)}</p>
                {row.needsRefund ? (
                  <p className="text-sm text-ink-700">Needs refund{row.refundReason ? ` · ${row.refundReason}` : ""}</p>
                ) : null}
                {row.createdAt ? <p className="text-sm text-ink-500">{formatCentralTimestamp(row.createdAt)}</p> : null}
              </li>
            );
          })}
        </ul>
      ) : null}
      {rows != null ? <p className="text-sm text-ink-500">{total.toLocaleString("en-US")} payments</p> : null}
    </div>
  );
}
