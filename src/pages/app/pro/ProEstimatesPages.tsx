import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { JobReference } from "../../../components/marketplace/JobReference";
import { EmptyState } from "../../../components/layout/DashboardShell";
import { ConfirmDialog } from "../../../components/ui/ConfirmDialog";
import { FormError } from "../../../lib/auth/AuthCard";
import { useAuth } from "../../../lib/auth/useAuth";
import { deleteEstimate, fetchMyEstimates, fetchMyNotifications, markNotificationRead, type ContractorEstimateListItem } from "../../../lib/marketplace/api";
import { formatUsdFromCents } from "../../../lib/marketplace/fees";
import { friendlyTimestamp } from "../../../lib/marketplace/contractorPolish";
import { notificationProjectLine, safeNoticeText, safeNoticeTitle } from "../../../lib/notifications/presentation";
import { listMyMessageThreads } from "../../../lib/marketplace/messagingApi";
import { messageNotificationHref } from "../../../lib/marketplace/messaging";
import { notificationPath } from "../../../lib/notifications/policy";
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
  }, [user]);

  return (
    <div className="space-y-6">
      <header>
        <h1 className="font-display text-4xl font-semibold text-forest-800">My Estimates</h1>
        <p className="mt-2 text-sm text-ink-700">
          Track what you sent. Opening this list does not mark an estimate as viewed.
          Delete an unsent draft from its card. Withdraw keeps a sent estimate in history when you open that estimate.
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
      <JobReference value={row.project_reference_number} />
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
  return (
    <span className="inline-flex min-h-8 items-center rounded-full bg-cream-100 px-3 text-xs font-semibold text-forest-800">
      {prefix}
      {label}
      {extra}
    </span>
  );
}

function ProUpdatesList({
  rows,
  projects,
  onRead,
}: {
  rows: Awaited<ReturnType<typeof fetchMyNotifications>>;
  projects: Record<string, { title: string; reference: number | null }>;
  onRead: (row: Awaited<ReturnType<typeof fetchMyNotifications>>[number]) => void;
}) {
  const visible = rows.filter((row) => row.kind !== "message.received" && row.action_state !== "historical");
  if (visible.length === 0) return null;
  return (
    <section className="space-y-3">
      <h2 className="font-display text-2xl text-forest-800">Updates</h2>
      <ul className="space-y-2">
        {visible.slice(0, 5).map((row) => {
          const messageHref =
            row.kind === "message.received" || row.kind === "contact.shared"
              ? messageNotificationHref("contractor", row.payload)
              : notificationPath({
                  kind: row.kind,
                  entityId: row.entity_id,
                  payload: row.payload ?? {},
                  accountType: "CONTRACTOR",
                });
          const known = typeof row.payload?.project_id === "string" ? projects[row.payload.project_id] : undefined;
          const title = safeNoticeTitle(row.title);
          const context = notificationProjectLine({
            projectTitle:
              (typeof row.payload?.project_title === "string" && row.payload.project_title) || known?.title,
            referenceNumber: row.payload?.project_reference_number ?? row.payload?.reference_number ?? known?.reference,
            payload: row.payload,
          });
          const body = safeNoticeText(title, row.body);
          const when = friendlyTimestamp(row.created_at);
          const inner = (
            <>
              <p className="font-semibold text-forest-800">{title}</p>
              {context ? <p className="text-forest-800">{context}</p> : null}
              {body ? <p className="text-ink-700">{body}</p> : null}
              {when ? <p className="text-xs text-ink-500">{when}</p> : null}
            </>
          );
          return (
          <li key={row.id}>
            {messageHref ? (
              <Link
                to={messageHref}
                className="block w-full rounded-2xl border border-forest-800/10 px-4 py-3 text-left text-sm"
                onClick={() => onRead(row)}
              >
                {inner}
              </Link>
            ) : (
            <button
              type="button"
              className="w-full rounded-2xl border border-forest-800/10 px-4 py-3 text-left text-sm"
              onClick={() => onRead(row)}
            >
              {inner}
            </button>
            )}
          </li>
          );
        })}
      </ul>
    </section>
  );
}

function LiveProNotificationsList() {
  const { user } = useAuth();
  const [rows, setRows] = useState<Awaited<ReturnType<typeof fetchMyNotifications>>>([]);
  const [projects, setProjects] = useState<Record<string, { title: string; reference: number | null }>>({});

  useEffect(() => {
    if (!user) return;
    void fetchMyNotifications()
      .then(setRows)
      .catch(() => setRows([]));
    void listMyMessageThreads()
      .then((threads) => {
        setProjects(
          Object.fromEntries(
            threads.map((thread) => [
              thread.project_id,
              { title: thread.project_title, reference: thread.project_reference_number ?? null },
            ]),
          ),
        );
      })
      .catch(() => undefined);
  }, [user]);

  return (
    <ProUpdatesList
      rows={rows}
      projects={projects}
      onRead={(row) => {
        if (row.read_at) return;
        void markNotificationRead(row.id).then(() =>
          setRows((current) =>
            current.map((item) => (item.id === row.id ? { ...item, read_at: new Date().toISOString() } : item)),
          ),
        );
      }}
    />
  );
}

export function ProNotificationsList({
  previewRows,
}: {
  previewRows?: Awaited<ReturnType<typeof fetchMyNotifications>>;
}) {
  if (previewRows) return <ProUpdatesList rows={previewRows} projects={{}} onRead={() => undefined} />;
  return <LiveProNotificationsList />;
}
