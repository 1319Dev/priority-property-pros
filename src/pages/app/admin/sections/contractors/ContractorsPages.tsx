import { useEffect, useState } from "react";
import { Link, Outlet, useMatch, useOutletContext } from "react-router-dom";
import { AdminFilterField, adminFieldClass } from "../../../../../components/admin/shell/AdminFilters";
import { AdminMasterDetail } from "../../../../../components/admin/shell/AdminMasterDetail";
import { AdminIncludeTestToggle, AdminPageHeader, initialIncludeTest } from "../../../../../components/admin/shell/AdminPageHeader";
import { AdminStatusPill } from "../../../../../components/admin/shell/AdminStatusPill";
import { useAdminDesktop } from "../../../../../components/admin/shell/useAdminDesktop";
import { ErrorState } from "../../../../../components/ui/PageState";
import { Skeleton } from "../../../../../components/ui/Skeleton";
import {
  fetchContractor,
  fetchContractors,
  type ContractorDetail,
  type ContractorRow,
} from "../../../../../lib/admin/contractorsApi";
import { formatCents } from "../../../../../lib/admin/money";
import { formatProjectReference } from "../../../../../lib/marketplace/projectReference";

const STATUSES = ["", "PENDING", "APPROVED", "REJECTED", "ACTIVE", "SUSPENDED", "PAID", "UNPAID", "NOT_REQUIRED"] as const;

function ratingLabel(rating: number | null, count: number): string {
  if (count === 0 || rating == null) return "No reviews yet";
  return `${rating.toFixed(1)} from ${count.toLocaleString("en-US")} reviews`;
}

export function ContractorsLayout() {
  const desktop = useAdminDesktop();
  const detailMatch = useMatch("/app/admin/contractors/:contractorProfileId");
  const [includeTest, setIncludeTest] = useState(initialIncludeTest);
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState("");
  const [rows, setRows] = useState<ContractorRow[] | null>(null);
  const [total, setTotal] = useState(0);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setError(null);
    void fetchContractors({ query, status, includeTest })
      .then((list) => {
        if (cancelled) return;
        setRows(list.rows);
        setTotal(list.total);
      })
      .catch((reason: unknown) => {
        if (cancelled) return;
        setRows([]);
        setError(reason instanceof Error ? reason.message : "Could not load contractors.");
      });
    return () => {
      cancelled = true;
    };
  }, [query, status, includeTest]);

  const list = (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-2">
        <AdminFilterField label="Search">
          <input
            className={adminFieldClass}
            value={query}
            placeholder="Business, email, or ID"
            aria-label="Search contractors by business name, email, or ID"
            onChange={(event) => setQuery(event.target.value)}
          />
        </AdminFilterField>
        <AdminFilterField label="Status">
          <select className={adminFieldClass} aria-label="Contractor status" value={status} onChange={(event) => setStatus(event.target.value)}>
            {STATUSES.map((value) => (
              <option key={value || "any"} value={value}>
                {value ? value.charAt(0) + value.slice(1).toLowerCase().replaceAll("_", " ") : "Any status"}
              </option>
            ))}
          </select>
        </AdminFilterField>
      </div>
      {error ? <ErrorState message={error} /> : null}
      {rows == null ? <Skeleton className="h-28" /> : null}
      {rows != null && rows.length === 0 ? (
        <p className="rounded-3xl border border-dashed border-forest-800/20 bg-cream-100 px-5 py-6 text-sm text-ink-700">No contractors match.</p>
      ) : null}
      {rows != null && rows.length > 0 ? (
        <ul className="space-y-2">
          {rows.map((row) => (
            <li key={row.contractorProfileId}>
              <Link
                to={`/app/admin/contractors/${row.contractorProfileId}`}
                className="block rounded-3xl border border-forest-800/10 bg-cream-50 px-4 py-3 hover:border-forest-800"
              >
                <span className="flex flex-wrap items-center justify-between gap-2">
                  <span className="font-semibold text-forest-800">{row.businessName}</span>
                  <AdminStatusPill label={row.approvalStatus} />
                </span>
                <span className="mt-1 block text-sm text-ink-700">{row.trades.join(", ") || "No trade listed"}</span>
                <span className="mt-1 block text-sm text-ink-500">
                  {row.area || "No area listed"} · Activation {row.signupFeeStatus} · {ratingLabel(row.rating, row.reviewCount)}
                  {row.flag ? ` · Flag ${row.flag}` : ""}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      ) : null}
      {rows != null ? <p className="text-sm text-ink-500">{total.toLocaleString("en-US")} contractors</p> : null}
    </div>
  );

  return (
    <div className="min-w-0 space-y-6">
      <AdminPageHeader
        title="Contractors"
        description="Business names are visible here. This screen is read-only. Test accounts stay hidden unless you include them."
        actions={<AdminIncludeTestToggle checked={includeTest} onChange={setIncludeTest} />}
      />
      <AdminMasterDetail
        desktop={desktop}
        showList={!detailMatch}
        list={list}
        detail={
          detailMatch ? (
            <Outlet context={{ includeTest }} />
          ) : (
            <p className="rounded-3xl border border-dashed border-forest-800/20 px-5 py-6 text-sm text-ink-700">
              Select a contractor to see jobs, estimates, and payments.
            </p>
          )
        }
        listLabel="Contractors"
        detailLabel="Contractor"
      />
    </div>
  );
}

export function ContractorDetailPage() {
  const match = useMatch("/app/admin/contractors/:contractorProfileId");
  const contractorProfileId = match?.params.contractorProfileId ?? "";
  const outlet = useOutletContext<{ includeTest?: boolean } | null>();
  const includeTest = outlet?.includeTest ?? initialIncludeTest();
  const [detail, setDetail] = useState<ContractorDetail | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!contractorProfileId) return undefined;
    let cancelled = false;
    setDetail(null);
    setError(null);
    void fetchContractor(contractorProfileId, includeTest)
      .then((next) => {
        if (!cancelled) setDetail(next);
      })
      .catch((reason: unknown) => {
        if (!cancelled) setError(reason instanceof Error ? reason.message : "Could not load that contractor.");
      });
    return () => {
      cancelled = true;
    };
  }, [contractorProfileId, includeTest]);

  return (
    <div className="space-y-4">
      <Link to="/app/admin/contractors" className="inline-flex min-h-11 items-center text-sm font-semibold text-forest-800 underline">
        Back to contractors
      </Link>
      {error ? <ErrorState message={error} /> : null}
      {detail == null && !error ? <Skeleton className="h-40" /> : null}
      {detail ? <ContractorDetailView detail={detail} /> : null}
    </div>
  );
}

export function ContractorDetailView({ detail }: { detail: ContractorDetail }) {
  return (
    <article className="space-y-5 rounded-3xl border border-forest-800/10 bg-cream-50 px-4 py-4">
      <header>
        <h2 className="font-display text-3xl font-semibold text-forest-800">{detail.businessName}</h2>
        <p className="mt-1 text-sm text-ink-700">{detail.email}</p>
        <p className="mt-2 text-sm text-ink-700">{detail.trades.join(", ") || "No trade listed"}</p>
        <p className="text-sm text-ink-700">{detail.area || "No area listed"}</p>
        <p className="mt-1 text-sm text-ink-700">{ratingLabel(detail.rating, detail.reviewCount)}</p>
        <div className="mt-3 flex flex-wrap gap-2">
          <AdminStatusPill label={detail.approvalStatus} />
          <AdminStatusPill label={detail.accountStatus} />
          <AdminStatusPill label={`Activation ${detail.signupFeeStatus}`} />
          {detail.flag ? <AdminStatusPill label={`Flag ${detail.flag}`} /> : null}
        </div>
      </header>
      <section>
        <h3 className="font-display text-xl text-forest-800">Jobs</h3>
        {detail.jobs.length === 0 ? <p className="mt-2 text-sm text-ink-700">No jobs yet.</p> : null}
        <ul className="mt-2 space-y-2">
          {detail.jobs.map((job) => {
            const reference = formatProjectReference(job.referenceNumber);
            return (
              <li key={job.bookingId} className="rounded-2xl bg-cream-100 px-3 py-3 text-sm">
                <p className="font-semibold text-forest-800">{job.title}</p>
                <p className="text-ink-700">
                  {reference ? (
                    <Link className="font-semibold underline" to={`/app/admin/bookings?ref=${reference}`}>
                      {reference}
                    </Link>
                  ) : null}
                  {reference ? " · " : null}
                  {job.status}
                </p>
              </li>
            );
          })}
        </ul>
      </section>
      <section>
        <h3 className="font-display text-xl text-forest-800">Estimates</h3>
        <ul className="mt-2 space-y-2">
          {detail.estimates.map((estimate) => (
            <li key={estimate.estimateId} className="rounded-2xl bg-cream-100 px-3 py-3 text-sm">
              <p className="font-semibold text-forest-800">
                {estimate.title} · {formatCents(estimate.totalCents)}
              </p>
              <p className="text-ink-700">{estimate.status}</p>
            </li>
          ))}
        </ul>
      </section>
      <section>
        <h3 className="font-display text-xl text-forest-800">Payments</h3>
        <ul className="mt-2 space-y-2">
          {detail.payments.map((payment) => {
            const reference = formatProjectReference(payment.referenceNumber);
            return (
              <li key={payment.paymentId} className="rounded-2xl bg-cream-100 px-3 py-3 text-sm">
                <p className="font-semibold text-forest-800">
                  {payment.kind === "connect" ? "Connect" : "Activation"} · {formatCents(payment.amountCents)} · {payment.status}
                </p>
                <p className="text-ink-700">
                  {reference ?? "No project"}
                  {payment.needsRefund ? ` · Refund flag${payment.refundReason ? `: ${payment.refundReason}` : ""}` : " · No refund flag"}
                </p>
              </li>
            );
          })}
        </ul>
      </section>
    </article>
  );
}
