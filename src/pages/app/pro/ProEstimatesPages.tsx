import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { EmptyState } from "../../../components/layout/DashboardShell";
import { HumanStatus } from "../../../components/ui/StatusBanner";
import { FormError } from "../../../lib/auth/AuthCard";
import { useAuth } from "../../../lib/auth/useAuth";
import { fetchMyEstimates, fetchMyNotifications, markNotificationRead, type ContractorEstimateListItem } from "../../../lib/marketplace/api";
import { formatUsdFromCents } from "../../../lib/marketplace/fees";
import {
  contractorEstimateStatusDetail,
  contractorEstimateStatusLabel,
  contractorEstimateUiStatus,
  formatViewedTimestamp,
  type ContractorEstimateUiStatus,
} from "../../../lib/marketplace/estimateLifecycle";
import type { EstimateStatus } from "../../../lib/marketplace/types";

export function ProEstimatesPage() {
  const { user } = useAuth();
  const [rows, setRows] = useState<ContractorEstimateListItem[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!user) return;
    void fetchMyEstimates()
      .then(setRows)
      .catch((err: Error) => setError(err.message));
  }, [user]);

  return (
    <div className="space-y-6">
      <header>
        <h1 className="font-display text-4xl font-semibold text-forest-800">My Estimates</h1>
        <p className="mt-2 text-sm text-ink-700">
          Track what you sent. Opening this list does not mark an estimate as viewed by the customer.
        </p>
      </header>
      <FormError message={error} />
      {rows.length === 0 ? (
        <EmptyState title="No estimates yet" body="Submitted estimates will land here with a clear status." />
      ) : (
        <ul className="space-y-3">
          {rows.map((row) => (
            <ContractorEstimateCard key={row.id} row={row} />
          ))}
        </ul>
      )}
    </div>
  );
}

export function ContractorEstimateCard({ row }: { row: ContractorEstimateListItem }) {
  const status = contractorEstimateUiStatus(row.status as EstimateStatus);
  return (
    <li className="rounded-3xl border border-forest-800/10 bg-cream-50 px-5 py-4">
      <EstimateStatusChip status={status} viewedAt={row.last_viewed_at ?? row.first_viewed_at} />
      <p className="mt-2 font-semibold text-forest-800">{row.project_title || "Project"}</p>
      <p className="text-sm text-ink-700">{formatUsdFromCents(row.total_cents)}</p>
      <p className="text-sm text-ink-500">
        Submitted {row.submitted_at ? formatViewedTimestamp(row.submitted_at) : "—"}
      </p>
      {contractorEstimateStatusDetail(row.status as EstimateStatus) ? (
        <p className="mt-2 text-sm text-ink-700">{contractorEstimateStatusDetail(row.status as EstimateStatus)}</p>
      ) : null}
      {row.opportunity_id ? (
        <Link
          to={`/app/pro/opportunities/${row.opportunity_id}/estimate`}
          className="mt-3 inline-flex min-h-12 items-center font-semibold text-forest-800"
        >
          Open estimate
        </Link>
      ) : null}
    </li>
  );
}

export function EstimateStatusChip({
  status,
  viewedAt,
}: {
  status: ContractorEstimateUiStatus;
  viewedAt?: string | null;
}) {
  const label = contractorEstimateStatusLabel(
    status === "sent"
      ? "SENT"
      : status === "viewed"
        ? "VIEWED"
        : status === "accepted"
          ? "ACCEPTED"
          : status === "not_selected"
            ? "DECLINED"
            : status === "withdrawn"
              ? "WITHDRAWN"
              : status === "draft"
                ? "DRAFT"
                : status === "expired"
                  ? "EXPIRED"
                  : "SUPERSEDED",
  );
  const extra =
    status === "viewed" && viewedAt ? ` · ${formatViewedTimestamp(viewedAt)}` : "";
  const prefix = status === "viewed" ? "👁 " : status === "accepted" ? "✓ " : "";
  return <HumanStatus label={`${prefix}${label}${extra}`} />;
}

export function ProNotificationsList() {
  const { user } = useAuth();
  const [rows, setRows] = useState<Awaited<ReturnType<typeof fetchMyNotifications>>>([]);

  useEffect(() => {
    if (!user) return;
    void fetchMyNotifications()
      .then(setRows)
      .catch(() => setRows([]));
  }, [user]);

  if (rows.length === 0) return null;
  return (
    <section className="space-y-3">
      <h2 className="font-display text-2xl text-forest-800">Updates</h2>
      <ul className="space-y-2">
        {rows.slice(0, 5).map((row) => (
          <li key={row.id}>
            <button
              type="button"
              className="w-full rounded-2xl border border-forest-800/10 px-4 py-3 text-left text-sm"
              onClick={() => {
                if (!row.read_at) {
                  void markNotificationRead(row.id).then(() =>
                    setRows((current) =>
                      current.map((item) => (item.id === row.id ? { ...item, read_at: new Date().toISOString() } : item)),
                    ),
                  );
                }
              }}
            >
              <p className="font-semibold text-forest-800">{row.title}</p>
              <p className="text-ink-700">{row.body}</p>
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}
