import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { BrandLoader } from "../../../components/brand/BrandLoader";
import { EmptyState } from "../../../components/layout/DashboardShell";
import { CONTACT_LINK_LABEL, CONTACT_PATH } from "../../../data/brand";
import { FormError } from "../../../lib/auth/AuthCard";
import { useAuth } from "../../../lib/auth/useAuth";
import { fetchContractorProfileByUser } from "../../../lib/marketplace/api";
import { formatUsdFromCents } from "../../../lib/marketplace/fees";
import {
  accountActivationText,
  billingTotalChargedCents,
  fetchProBillingRows,
  formatBillingDate,
  type BillingRow,
} from "../../../lib/billing/proBilling";

export function ProBillingPage() {
  const { user, profile, account_type } = useAuth();
  const [rows, setRows] = useState<BillingRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!user) return;
    let stop = false;
    void fetchContractorProfileByUser(user.id)
      .then((contractor) => {
        if (!contractor) throw new Error("Contractor profile missing.");
        return fetchProBillingRows({ profileId: user.id, contractorProfileId: contractor.id });
      })
      .then((next) => {
        if (!stop) setRows(next);
      })
      .catch((err: Error) => {
        if (!stop) {
          setError(err.message);
          setRows([]);
        }
      });
    return () => {
      stop = true;
    };
  }, [user]);

  const paidActivation = rows?.find((row) => row.kind === "activation" && row.charged && !row.testMode);
  const activation = accountActivationText({
    accountType: account_type,
    status: profile?.signup_fee_status,
    paidAt: profile?.signup_fee_paid_at,
    paidChargeAt: paidActivation?.date ?? null,
  });
  const total = rows ? billingTotalChargedCents(rows) : 0;

  return (
    <div className="space-y-6">
      <header>
        <p className="text-xs font-semibold uppercase tracking-[0.22em] text-gold-700">Priority Pro</p>
        <h1 className="mt-2 font-display text-4xl font-semibold text-forest-800">Billing</h1>
        <p className="mt-2 max-w-xl text-sm text-ink-700">
          Your $4.99 Connect payments and your $9.99 account activation. PPP takes no share of job payments. Read-only.
        </p>
      </header>
      <section className="rounded-3xl border border-forest-800/10 bg-cream-50 px-5 py-4 text-sm" aria-label="Activation">
        <p className="text-xs font-semibold uppercase tracking-[0.16em] text-gold-700">Account activation</p>
        <p className="mt-1 font-semibold text-forest-800">{activation.text}</p>
      </section>
      <FormError message={error} />
      {rows === null ? <BrandLoader layout="section" label="Loading billing" /> : null}
      {rows !== null && rows.length === 0 && !error ? (
        <EmptyState title="No payments yet" body="Connect payments and your activation will be listed here." />
      ) : null}
      {rows && rows.length > 0 ? (
        <section aria-label="Payments" className="space-y-3">
          <p className="text-sm text-ink-700">
            Charged to date: <span className="font-semibold text-forest-800">{formatUsdFromCents(total)}</span>
          </p>
          <ul className="space-y-3">
            {rows.map((row) => (
              <li key={row.id} className="rounded-3xl border border-forest-800/10 bg-cream-50 px-5 py-4 text-sm">
                <div className="flex min-w-0 flex-wrap items-baseline justify-between gap-2">
                  <p className="font-semibold text-forest-800">
                    {row.label}
                    {row.jobRef ? ` · ${row.jobRef}` : row.kind === "connect" ? " · Job ref unavailable" : ""}
                  </p>
                  <p className="font-semibold text-forest-800">{formatUsdFromCents(row.amountCents)}</p>
                </div>
                <dl className="mt-2 grid grid-cols-1 gap-1 text-ink-700 sm:grid-cols-3">
                  <div>
                    <dt className="sr-only">Date</dt>
                    <dd>{formatBillingDate(row.date)}</dd>
                  </div>
                  <div>
                    <dt className="sr-only">Status</dt>
                    <dd>
                      {row.status}
                      {row.testMode ? " · test mode, no real charge" : ""}
                    </dd>
                  </div>
                  <div>
                    <dt className="sr-only">Receipt</dt>
                    <dd className="text-ink-500">Receipt link not stored by PPP</dd>
                  </div>
                </dl>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
      <p className="text-sm text-ink-500">
        Questions about a charge or a refund exception:{" "}
        <Link className="font-semibold text-forest-800 underline" to={CONTACT_PATH}>
          {CONTACT_LINK_LABEL}
        </Link>
      </p>
    </div>
  );
}
