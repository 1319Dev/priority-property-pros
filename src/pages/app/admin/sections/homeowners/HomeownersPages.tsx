import { useEffect, useState } from "react";
import { Link, Outlet, useMatch, useOutletContext } from "react-router-dom";
import { AdminFilterField, adminFieldClass } from "../../../../../components/admin/shell/AdminFilters";
import { AdminMasterDetail } from "../../../../../components/admin/shell/AdminMasterDetail";
import { AdminIncludeTestToggle, AdminPageHeader, initialIncludeTest } from "../../../../../components/admin/shell/AdminPageHeader";
import { AdminStatusPill } from "../../../../../components/admin/shell/AdminStatusPill";
import { useAdminDesktop } from "../../../../../components/admin/shell/useAdminDesktop";
import { CustomerProfileEditor } from "../../../../../components/admin/profileEdit/ProfileEditors";
import { ErrorState } from "../../../../../components/ui/PageState";
import { Skeleton } from "../../../../../components/ui/Skeleton";
import { friendlyAdminError } from "../../../../../lib/admin/friendlyAdminError";
import {
  fetchHomeowner,
  fetchHomeowners,
  type HomeownerDetail,
  type HomeownerRow,
} from "../../../../../lib/admin/homeownersApi";
import { formatCents, formatCentralTimestamp } from "../../../../../lib/admin/money";
import { formatProjectReference } from "../../../../../lib/marketplace/projectReference";

const STATUSES = ["", "ACTIVE", "PENDING", "SUSPENDED", "DISABLED", "DELETED", "ALL"] as const;

function statusLabel(value: string): string {
  if (!value) return "Open accounts";
  if (value === "ALL") return "All, including deleted";
  return value.charAt(0) + value.slice(1).toLowerCase();
}

export function HomeownersLayout() {
  const desktop = useAdminDesktop();
  const detailMatch = useMatch("/app/admin/homeowners/:profileId");
  const [includeTest, setIncludeTest] = useState(initialIncludeTest);
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState("");
  const [rows, setRows] = useState<HomeownerRow[] | null>(null);
  const [total, setTotal] = useState(0);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setError(null);
    void fetchHomeowners({ query, status, includeTest })
      .then((list) => {
        if (cancelled) return;
        setRows(list.rows);
        setTotal(list.total);
      })
      .catch((reason: unknown) => {
        if (cancelled) return;
        setRows([]);
        setTotal(0);
        setError(reason instanceof Error ? reason.message : "Could not load homeowners.");
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
            placeholder="Name, email, or ID"
            aria-label="Search homeowners by name, email, or ID"
            onChange={(event) => setQuery(event.target.value)}
          />
        </AdminFilterField>
        <AdminFilterField label="Status">
          <select className={adminFieldClass} aria-label="Homeowner status" value={status} onChange={(event) => setStatus(event.target.value)}>
            {STATUSES.map((value) => (
              <option key={value || "open"} value={value}>
                {statusLabel(value)}
              </option>
            ))}
          </select>
        </AdminFilterField>
      </div>
      {error ? <ErrorState message={friendlyAdminError({ message: error }, "Could not load homeowners.")} /> : null}
      {rows == null ? (
        <Skeleton className="h-28" />
      ) : rows.length === 0 ? (
        <p className="rounded-3xl border border-dashed border-forest-800/20 bg-cream-100 px-5 py-6 text-sm text-ink-700">
          No homeowners match.
        </p>
      ) : (
        <ul className="space-y-2">
          {rows.map((row) => (
            <li key={row.profileId}>
              <Link
                to={`/app/admin/homeowners/${row.profileId}`}
                className="block rounded-3xl border border-forest-800/10 bg-cream-50 px-4 py-3 hover:border-forest-800"
              >
                <span className="flex flex-wrap items-center justify-between gap-2">
                  <span className="font-semibold text-forest-800">{row.displayName}</span>
                  <AdminStatusPill label={row.accountStatus} />
                </span>
                <span className="mt-1 block text-sm text-ink-700">{row.email}</span>
                <span className="mt-1 block text-sm text-ink-500">
                  {row.projectCount.toLocaleString("en-US")} projects · Activation {row.signupFeeStatus}
                  {row.flag ? ` · Flag ${row.flag}` : ""}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
      {rows != null ? <p className="text-sm text-ink-500">{total.toLocaleString("en-US")} homeowners</p> : null}
    </div>
  );

  return (
    <div className="min-w-0 space-y-6">
      <AdminPageHeader
        title="Homeowners"
        description="Search homeowner accounts. Open one to edit the profile; every save needs a reason and is audited. Test accounts stay hidden unless you include them."
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
              Select a homeowner to see projects, activation payments, and flags.
            </p>
          )
        }
        listLabel="Homeowners"
        detailLabel="Homeowner"
      />
    </div>
  );
}

export function HomeownerDetailPage() {
  const match = useMatch("/app/admin/homeowners/:profileId");
  const profileId = match?.params.profileId ?? "";
  const outlet = useOutletContext<{ includeTest?: boolean } | null>();
  const includeTest = outlet?.includeTest ?? initialIncludeTest();
  const [detail, setDetail] = useState<HomeownerDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    if (!profileId) return undefined;
    let cancelled = false;
    setDetail(null);
    setError(null);
    void fetchHomeowner(profileId, includeTest)
      .then((next) => {
        if (!cancelled) setDetail(next);
      })
      .catch((reason: unknown) => {
        if (!cancelled) setError(reason instanceof Error ? reason.message : "Could not load that homeowner.");
      });
    return () => {
      cancelled = true;
    };
  }, [profileId, includeTest, reloadKey]);

  return (
    <div className="space-y-4">
      <Link to="/app/admin/homeowners" className="inline-flex min-h-11 items-center text-sm font-semibold text-forest-800 underline">
        Back to homeowners
      </Link>
      {error ? <ErrorState message={error} /> : null}
      {detail == null && !error ? <Skeleton className="h-40" /> : null}
      {detail ? <HomeownerDetailView detail={detail} onProfileSaved={() => setReloadKey((key) => key + 1)} /> : null}
    </div>
  );
}

export function HomeownerDetailView({ detail, onProfileSaved }: { detail: HomeownerDetail; onProfileSaved?: () => void }) {
  return (
    <article className="space-y-5 rounded-3xl border border-forest-800/10 bg-cream-50 px-4 py-4">
      <header>
        <h2 className="font-display text-3xl font-semibold text-forest-800">{detail.displayName}</h2>
        <p className="mt-1 text-sm text-ink-700">{detail.email}</p>
        <p className="mt-1 break-all font-mono text-xs text-ink-500">{detail.profileId}</p>
        <div className="mt-3 flex flex-wrap gap-2">
          <AdminStatusPill label={detail.accountStatus} />
          <AdminStatusPill label={`Activation ${detail.signupFeeStatus}`} />
          {detail.flag ? <AdminStatusPill label={`Flag ${detail.flag}`} /> : null}
        </div>
        {detail.flagNote ? <p className="mt-2 text-sm text-ink-700">{detail.flagNote}</p> : null}
      </header>
      <CustomerProfileEditor key={detail.profileId} profileId={detail.profileId} onSaved={onProfileSaved} />
      <section>
        <h3 className="font-display text-xl text-forest-800">Projects</h3>
        {detail.projects.length === 0 ? <p className="mt-2 text-sm text-ink-700">No projects yet.</p> : null}
        <ul className="mt-2 space-y-2">
          {detail.projects.map((project) => {
            const reference = formatProjectReference(project.referenceNumber);
            return (
              <li key={project.projectId} className="rounded-2xl bg-cream-100 px-3 py-3 text-sm">
                <p className="font-semibold text-forest-800">{project.title}</p>
                <p className="text-ink-700">
                  {reference ? (
                    <Link className="font-semibold underline" to={`/app/admin/bookings?ref=${reference}`}>
                      {reference}
                    </Link>
                  ) : null}
                  {reference ? " · " : null}
                  {project.status}
                  {project.city ? ` · ${project.city}` : ""}
                </p>
              </li>
            );
          })}
        </ul>
      </section>
      <section>
        <h3 className="font-display text-xl text-forest-800">Activation payments</h3>
        {detail.payments.length === 0 ? <p className="mt-2 text-sm text-ink-700">No activation charges.</p> : null}
        <ul className="mt-2 space-y-2">
          {detail.payments.map((payment) => (
            <li key={payment.chargeId} className="rounded-2xl bg-cream-100 px-3 py-3 text-sm">
              <p className="font-semibold text-forest-800">
                {formatCents(payment.amountCents)} · {payment.status}
                {payment.livemode ? "" : " · Test mode"}
              </p>
              <p className="text-ink-500">{payment.fulfilledAt ? formatCentralTimestamp(payment.fulfilledAt) : payment.createdAt ? formatCentralTimestamp(payment.createdAt) : "—"}</p>
              <p className="text-ink-700">{payment.needsRefund ? `Refund flag${payment.refundReason ? `: ${payment.refundReason}` : ""}` : "No refund flag"}</p>
            </li>
          ))}
        </ul>
      </section>
    </article>
  );
}
