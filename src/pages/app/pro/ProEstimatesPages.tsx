import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { EmptyState } from "../../../components/layout/DashboardShell";
import { ConfirmDialog } from "../../../components/ui/ConfirmDialog";
import { HumanStatus } from "../../../components/ui/StatusBanner";
import { FormError } from "../../../lib/auth/AuthCard";
import { useAuth } from "../../../lib/auth/useAuth";
import { deleteEstimate, fetchMyEstimates, fetchMyNotifications, markNotificationRead, type ContractorEstimateListItem } from "../../../lib/marketplace/api";
import { formatUsdFromCents } from "../../../lib/marketplace/fees";
import {
  canDeleteFrom,
  contractorEstimateStatusDetail,
  contractorEstimateStatusLabel,
  contractorEstimateUiStatus,
  DELETE_ESTIMATE_BODY,
  DELETE_ESTIMATE_CONFIRM,
  DELETE_ESTIMATE_LABEL,
  DELETE_ESTIMATE_SUCCESS,
  DELETE_ESTIMATE_TITLE,
  formatViewedTimestamp,
  type ContractorEstimateUiStatus,
} from "../../../lib/marketplace/estimateLifecycle";
import type { EstimateStatus } from "../../../lib/marketplace/types";
import { useToast } from "../../../hooks/useToast";

export function ProEstimatesPage() {
  const { user } = useAuth();
  const toast = useToast();
  const [rows, setRows] = useState<ContractorEstimateListItem[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);

  function reload() {
    return fetchMyEstimates()
      .then(setRows)
      .catch((err: Error) => setError(err.message));
  }

  useEffect(() => {
    if (!user) return;
    void reload();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

  return (
    <div className="space-y-6">
      <header>
        <h1 className="font-display text-4xl font-semibold text-forest-800">My Estimates</h1>
        <p className="mt-2 text-sm text-ink-700">
          Track what you sent. Opening this list does not mark an estimate as viewed by the customer.
          Delete removes an unsent draft. Withdraw keeps a sent estimate in history.
        </p>
      </header>
      <FormError message={error} />
      {rows.length === 0 ? (
        <EmptyState title="No estimates yet" body="Submitted estimates will land here with a clear status." />
      ) : (
        <ul className="space-y-3">
          {rows.map((row) => (
            <ContractorEstimateCard
              key={row.id}
              row={row}
              onRequestDelete={canDeleteFrom(row.status as EstimateStatus) ? () => setDeleteId(row.id) : undefined}
            />
          ))}
        </ul>
      )}
      <ConfirmDialog
        open={Boolean(deleteId)}
        title={DELETE_ESTIMATE_TITLE}
        body={DELETE_ESTIMATE_BODY}
        confirmLabel={DELETE_ESTIMATE_CONFIRM}
        cancelLabel="Keep draft"
        busy={deleting}
        onClose={() => {
          if (!deleting) setDeleteId(null);
        }}
        onConfirm={() => {
          if (!deleteId) return;
          setDeleting(true);
          void deleteEstimate(deleteId)
            .then(() => {
              toast.push(DELETE_ESTIMATE_SUCCESS);
              setDeleteId(null);
              setRows((current) => current.filter((row) => row.id !== deleteId));
              return reload();
            })
            .catch((err: Error) => setError(err.message))
            .finally(() => setDeleting(false));
        }}
      />
    </div>
  );
}

export function ContractorEstimateCard({
  row,
  onRequestDelete,
}: {
  row: ContractorEstimateListItem;
  onRequestDelete?: () => void;
}) {
  const status = contractorEstimateUiStatus(row.status as EstimateStatus);
  const showDelete = canDeleteFrom(row.status as EstimateStatus);
  return (
    <li className="rounded-3xl border border-forest-800/10 bg-cream-50 px-5 py-4">
      <EstimateStatusChip status={status} viewedAt={row.last_viewed_at ?? row.first_viewed_at} />
      <p className="mt-2 font-semibold text-forest-800">{row.project_title || "Project"}</p>
      <p className="text-sm text-ink-700">{formatUsdFromCents(row.total_cents)}</p>
      <p className="text-sm text-ink-500">
        Submitted {row.submitted_at ? formatViewedTimestamp(row.submitted_at) : "—"}
      </p>
      {contractorEstimateStatusDetail(row.status as EstimateStatus, row.decline_reason) ? (
        <p className="mt-2 text-sm text-ink-700">{contractorEstimateStatusDetail(row.status as EstimateStatus, row.decline_reason)}</p>
      ) : null}
      <div className="mt-3 flex flex-wrap items-center gap-4">
        {row.opportunity_id ? (
          <Link
            to={`/app/pro/opportunities/${row.opportunity_id}/estimate`}
            className="inline-flex min-h-12 items-center font-semibold text-forest-800"
          >
            Open estimate
          </Link>
        ) : null}
        {showDelete ? (
          <button
            type="button"
            className="inline-flex min-h-12 items-center font-semibold text-danger-600"
            onClick={onRequestDelete}
          >
            {DELETE_ESTIMATE_LABEL}
          </button>
        ) : null}
      </div>
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
