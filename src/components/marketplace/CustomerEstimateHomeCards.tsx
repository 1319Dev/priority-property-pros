import { useContext, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { AuthContext } from "../../lib/auth/AuthContext";
import {
  fetchCustomerProjects,
  fetchMyBookings,
  fetchMyNotifications,
  markNotificationRead,
  type InAppNotificationRow,
} from "../../lib/marketplace/api";
import { customerNotificationHref } from "../../lib/marketplace/notifications";
import {
  notificationIsHistorical,
  notificationProjectLine,
  safeNoticeText,
  safeNoticeTitle,
  type NoticeBookingSnapshot,
} from "../../lib/notifications/presentation";
import type { Project } from "../../lib/marketplace/types";

function actionStateOf(row: InAppNotificationRow): "open" | "historical" | undefined {
  if (row.action_state === "historical" || row.action_state === "open") return row.action_state;
  return undefined;
}

function projectIdOf(row: InAppNotificationRow): string | null {
  return typeof row.payload?.project_id === "string" ? row.payload.project_id : null;
}

function bookingSnapshots(
  rows: readonly { project_id?: string; status?: string; customer_hired_at?: string | null; contractor_hired_at?: string | null }[],
): NoticeBookingSnapshot[] {
  return rows.flatMap((row) => {
    if (!row.project_id || !row.status) return [];
    return [
      {
        projectId: row.project_id,
        status: row.status,
        customerHiredAt: row.customer_hired_at,
        contractorHiredAt: row.contractor_hired_at,
      },
    ];
  });
}

function EstimateUpdateList({
  rows,
  projects,
  bookings,
  onRead,
}: {
  rows: readonly InAppNotificationRow[];
  projects: readonly Project[];
  bookings: readonly NoticeBookingSnapshot[];
  onRead: (row: InAppNotificationRow) => void;
}) {
  const visible = rows
    .filter((row) => typeof row.kind === "string" && row.kind.startsWith("estimate."))
    .filter((row) => {
      const projectId = projectIdOf(row);
      const project = projects.find((item) => item.id === projectId);
      return !notificationIsHistorical({
        kind: row.kind,
        actionState: actionStateOf(row),
        projectStatus: project?.status,
        selectedEstimateId: project?.selected_estimate_id,
        projectId,
        bookings,
      });
    })
    .sort((a, b) => (a.created_at < b.created_at ? 1 : -1))
    .slice(0, 5);

  if (visible.length === 0) return null;

  return (
    <section className="space-y-3" aria-label="Estimate updates">
      <ul className="space-y-2">
        {visible.map((row) => {
          const href = customerNotificationHref({
            kind: row.kind,
            entityId: row.entity_id,
            payload: row.payload,
          });
          const projectId = projectIdOf(row);
          const project = projects.find((item) => item.id === projectId);
          const title = safeNoticeTitle(row.title);
          const context = notificationProjectLine({
            projectTitle:
              (typeof row.payload?.project_title === "string" ? row.payload.project_title : null) || project?.title,
            referenceNumber:
              row.payload?.project_reference_number ?? row.payload?.reference_number ?? project?.reference_number,
            payload: row.payload,
          });
          const body = safeNoticeText(title, row.body);
          const className = `block w-full rounded-3xl border border-forest-800/10 bg-cream-50 px-5 py-4 text-left text-sm ${
            row.read_at ? "font-normal text-ink-700" : "font-semibold text-forest-800"
          }`;
          const inner = (
            <>
              <span className="block text-forest-800">{title}</span>
              {context ? <span className="mt-1 block font-medium text-forest-800">{context}</span> : null}
              {body ? <span className="mt-1 block font-normal text-ink-700">{body}</span> : null}
            </>
          );
          return (
            <li key={row.id}>
              {href ? (
                <Link to={href} className={className} onClick={() => onRead(row)}>
                  {inner}
                </Link>
              ) : (
                <button type="button" className={className} onClick={() => onRead(row)}>
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

function LiveCustomerEstimateCards() {
  const auth = useContext(AuthContext);
  const [rows, setRows] = useState<InAppNotificationRow[] | null>(null);
  const [projects, setProjects] = useState<Project[] | null>(null);
  const [bookings, setBookings] = useState<NoticeBookingSnapshot[] | null>(null);

  useEffect(() => {
    let stop = false;
    void fetchMyNotifications()
      .then((next) => {
        if (!stop) setRows(next);
      })
      .catch(() => {
        if (!stop) setRows([]);
      });
    void fetchCustomerProjects()
      .then((next) => {
        if (!stop) setProjects(next);
      })
      .catch(() => {
        if (!stop) setProjects([]);
      });
    const userId = auth?.user?.id;
    if (!userId) {
      setBookings([]);
    } else {
      void fetchMyBookings("customer", userId)
        .then((next) => {
          if (!stop) setBookings(bookingSnapshots(next));
        })
        .catch(() => {
          if (!stop) setBookings([]);
        });
    }
    return () => {
      stop = true;
    };
  }, [auth?.user?.id]);

  if (!rows || !projects || !bookings) return null;

  return (
    <EstimateUpdateList
      rows={rows}
      projects={projects}
      bookings={bookings}
      onRead={(row) => {
        if (row.read_at) return;
        void markNotificationRead(row.id)
          .then(() => {
            setRows((current) =>
              (current ?? []).map((item) => (item.id === row.id ? { ...item, read_at: new Date().toISOString() } : item)),
            );
          })
          .catch(() => undefined);
      }}
    />
  );
}

export function CustomerEstimateHomeCards({ previewRows }: { previewRows?: readonly InAppNotificationRow[] }) {
  if (previewRows) {
    return <EstimateUpdateList rows={previewRows} projects={[]} bookings={[]} onRead={() => undefined} />;
  }
  return <LiveCustomerEstimateCards />;
}
