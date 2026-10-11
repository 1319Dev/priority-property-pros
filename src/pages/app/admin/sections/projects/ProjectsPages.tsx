import { useEffect, useState } from "react";
import { Link, Outlet, useMatch } from "react-router-dom";
import { AdminFilterField, adminFieldClass } from "../../../../../components/admin/shell/AdminFilters";
import { AdminMasterDetail } from "../../../../../components/admin/shell/AdminMasterDetail";
import { AdminIncludeTestToggle, AdminPageHeader, initialIncludeTest } from "../../../../../components/admin/shell/AdminPageHeader";
import { AdminStatusPill } from "../../../../../components/admin/shell/AdminStatusPill";
import { useAdminDesktop } from "../../../../../components/admin/shell/useAdminDesktop";
import { ErrorState } from "../../../../../components/ui/PageState";
import { Skeleton } from "../../../../../components/ui/Skeleton";
import { fetchProject, fetchProjects, type ProjectDetail, type ProjectFilters, type ProjectRow } from "../../../../../lib/admin/projectsApi";
import { formatCents, formatCentralTimestamp } from "../../../../../lib/admin/money";
import { formatProjectReference } from "../../../../../lib/marketplace/projectReference";

const EMPTY: Omit<ProjectFilters, "includeTest"> = {
  query: "",
  customer: "",
  contractor: "",
  status: "",
  city: "",
  trade: "",
  from: "",
  to: "",
  disputed: "",
};

export function ProjectsLayout() {
  const desktop = useAdminDesktop();
  const detailMatch = useMatch("/app/admin/projects/:projectId");
  const [includeTest, setIncludeTest] = useState(initialIncludeTest);
  const [filters, setFilters] = useState(EMPTY);
  const [rows, setRows] = useState<ProjectRow[] | null>(null);
  const [total, setTotal] = useState(0);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setError(null);
    void fetchProjects({ ...filters, includeTest })
      .then((list) => {
        if (cancelled) return;
        setRows(list.rows);
        setTotal(list.total);
      })
      .catch((reason: unknown) => {
        if (cancelled) return;
        setRows([]);
        setError(reason instanceof Error ? reason.message : "Could not load projects.");
      });
    return () => {
      cancelled = true;
    };
  }, [filters, includeTest]);

  function setField<K extends keyof typeof EMPTY>(key: K, value: (typeof EMPTY)[K]) {
    setFilters((current) => ({ ...current, [key]: value }));
  }

  const list = (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-2">
        <AdminFilterField label="PPP number or title">
          <input className={adminFieldClass} aria-label="Project number or title" value={filters.query} onChange={(event) => setField("query", event.target.value)} />
        </AdminFilterField>
        <AdminFilterField label="Customer">
          <input className={adminFieldClass} aria-label="Customer" value={filters.customer} onChange={(event) => setField("customer", event.target.value)} />
        </AdminFilterField>
        <AdminFilterField label="Contractor">
          <input className={adminFieldClass} aria-label="Contractor" value={filters.contractor} onChange={(event) => setField("contractor", event.target.value)} />
        </AdminFilterField>
        <AdminFilterField label="Status">
          <input className={adminFieldClass} aria-label="Project status" value={filters.status} onChange={(event) => setField("status", event.target.value)} />
        </AdminFilterField>
        <AdminFilterField label="City">
          <input className={adminFieldClass} aria-label="City" value={filters.city} onChange={(event) => setField("city", event.target.value)} />
        </AdminFilterField>
        <AdminFilterField label="Trade">
          <input className={adminFieldClass} aria-label="Trade" value={filters.trade} onChange={(event) => setField("trade", event.target.value)} />
        </AdminFilterField>
        <AdminFilterField label="From">
          <input className={adminFieldClass} type="date" aria-label="From date" value={filters.from} onChange={(event) => setField("from", event.target.value)} />
        </AdminFilterField>
        <AdminFilterField label="To">
          <input className={adminFieldClass} type="date" aria-label="To date" value={filters.to} onChange={(event) => setField("to", event.target.value)} />
        </AdminFilterField>
        <AdminFilterField label="Dispute">
          <select className={adminFieldClass} aria-label="Dispute" value={filters.disputed} onChange={(event) => setField("disputed", event.target.value as ProjectFilters["disputed"])}>
            <option value="">Any</option>
            <option value="yes">Disputed</option>
            <option value="no">Not disputed</option>
          </select>
        </AdminFilterField>
      </div>
      {error ? <ErrorState message={error} /> : null}
      {rows == null ? <Skeleton className="h-28" /> : null}
      {rows != null && rows.length === 0 ? (
        <p className="rounded-3xl border border-dashed border-forest-800/20 bg-cream-100 px-5 py-6 text-sm text-ink-700">No projects match.</p>
      ) : null}
      {rows != null && rows.length > 0 ? (
        <ul className="space-y-2">
          {rows.map((row) => {
            const reference = formatProjectReference(row.referenceNumber);
            return (
              <li key={row.projectId} className="rounded-3xl border border-forest-800/10 bg-cream-50 px-4 py-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <Link className="font-semibold text-forest-800 underline" to={`/app/admin/projects/${row.projectId}`}>
                    {row.title}
                  </Link>
                  <AdminStatusPill label={row.disputed ? "Disputed" : row.status} />
                </div>
                <p className="mt-1 text-sm text-ink-700">
                  {reference ? (
                    <Link className="font-semibold underline" to={`/app/admin/bookings?ref=${reference}`}>
                      {reference}
                    </Link>
                  ) : (
                    "No PPP number"
                  )}
                  {row.city ? ` · ${row.city}` : ""}
                  {row.trade ? ` · ${row.trade}` : ""}
                </p>
                <p className="text-sm text-ink-500">
                  {row.customerName}
                  {row.contractorBusinessName ? ` · ${row.contractorBusinessName}` : ""}
                </p>
              </li>
            );
          })}
        </ul>
      ) : null}
      {rows != null ? <p className="text-sm text-ink-500">{total.toLocaleString("en-US")} projects</p> : null}
    </div>
  );

  return (
    <div className="min-w-0 space-y-6">
      <AdminPageHeader
        title="Projects"
        description="Search posted work by PPP number, people, status, city, trade, date, or dispute. House addresses and contact numbers stay off this list."
        actions={<AdminIncludeTestToggle checked={includeTest} onChange={setIncludeTest} />}
      />
      <AdminMasterDetail
        desktop={desktop}
        showList={!detailMatch}
        list={list}
        detail={detailMatch ? <Outlet /> : <p className="rounded-3xl border border-dashed border-forest-800/20 px-5 py-6 text-sm text-ink-700">Select a project to see its lifecycle.</p>}
        listLabel="Projects"
        detailLabel="Lifecycle"
      />
    </div>
  );
}

export function ProjectDetailPage() {
  const match = useMatch("/app/admin/projects/:projectId");
  const projectId = match?.params.projectId ?? "";
  const [detail, setDetail] = useState<ProjectDetail | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!projectId) return undefined;
    let cancelled = false;
    setError(null);
    void fetchProject(projectId)
      .then((next) => {
        if (!cancelled) setDetail(next);
      })
      .catch((reason: unknown) => {
        if (!cancelled) setError(reason instanceof Error ? reason.message : "Could not load that project.");
      });
    return () => {
      cancelled = true;
    };
  }, [projectId]);

  const reference = formatProjectReference(detail?.referenceNumber);
  return (
    <div className="space-y-4">
      <Link to="/app/admin/projects" className="inline-flex min-h-11 items-center text-sm font-semibold text-forest-800 underline">
        Back to projects
      </Link>
      {error ? <ErrorState message={error} /> : null}
      {detail == null && !error ? <Skeleton className="h-40" /> : null}
      {detail ? (
        <article className="space-y-4 rounded-3xl border border-forest-800/10 bg-cream-50 px-4 py-4">
          <h2 className="font-display text-3xl font-semibold text-forest-800">{detail.title}</h2>
          <p className="text-sm text-ink-700">
            {reference ? (
              <Link className="font-semibold underline" to={`/app/admin/bookings?ref=${reference}`}>
                Open {reference} in booking tools
              </Link>
            ) : (
              "No booking tools link yet"
            )}
          </p>
          <p className="text-sm text-ink-700">
            {detail.customerName}
            {detail.contractorBusinessName ? ` · ${detail.contractorBusinessName}` : ""}
            {detail.city ? ` · ${detail.city}` : ""}
            {detail.state ? `, ${detail.state}` : ""}
            {detail.trade ? ` · ${detail.trade}` : ""}
          </p>
          {detail.description ? <p className="text-sm text-ink-700">{detail.description}</p> : null}
          <section>
            <h3 className="font-display text-xl text-forest-800">Status history</h3>
            <ul className="mt-2 space-y-2">
              {detail.history.map((item, index) => (
                <li key={`${item.toStatus}-${index}`} className="text-sm text-ink-700">
                  {item.fromStatus ? `${item.fromStatus} → ` : ""}
                  {item.toStatus}
                  {item.createdAt ? ` · ${formatCentralTimestamp(item.createdAt)}` : ""}
                </li>
              ))}
            </ul>
          </section>
          <section>
            <h3 className="font-display text-xl text-forest-800">Estimates</h3>
            <ul className="mt-2 space-y-2">
              {detail.estimates.map((estimate) => (
                <li key={estimate.estimateId} className="text-sm text-ink-700">
                  {estimate.contractorBusinessName} · {estimate.status} · {formatCents(estimate.totalCents)}
                </li>
              ))}
            </ul>
          </section>
          <section>
            <h3 className="font-display text-xl text-forest-800">Bookings</h3>
            <ul className="mt-2 space-y-2">
              {detail.bookings.map((booking) => (
                <li key={booking.bookingId} className="text-sm text-ink-700">
                  {booking.status}
                  {booking.disputedAt ? " · disputed" : ""}
                  {booking.completedAt ? ` · completed ${formatCentralTimestamp(booking.completedAt)}` : ""}
                </li>
              ))}
            </ul>
          </section>
        </article>
      ) : null}
    </div>
  );
}
