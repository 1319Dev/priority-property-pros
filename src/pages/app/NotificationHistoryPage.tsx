import { Component, type ReactNode } from "react";
import { Link } from "react-router-dom";
import { BrandLoader } from "../../components/brand/BrandLoader";
import { EmptyState } from "../../components/layout/DashboardShell";
import { friendlyTimestamp } from "../../lib/marketplace/contractorPolish";
import { accountSettingsPath } from "../../lib/auth/roles";
import { useAuth } from "../../lib/auth/useAuth";
import type { InAppNotification } from "../../lib/notifications/api";
import {
  friendlyNotificationError,
  notificationProjectLine,
  safeNoticeText,
  safeNoticeTitle,
} from "../../lib/notifications/presentation";
import { useNotifications } from "../../lib/notifications/useNotifications";

export function NotificationHistoryView({
  items,
  ready,
  loadError,
  settingsPath,
  onOpen,
}: {
  items: readonly InAppNotification[];
  ready: boolean;
  loadError: string | null;
  settingsPath: string;
  onOpen: (item: InAppNotification) => void;
}) {
  const message = friendlyNotificationError(loadError);

  return (
    <div className="space-y-6">
      <header>
        <h1 className="font-display text-4xl font-semibold text-forest-800">Notification history</h1>
        <p className="mt-2 max-w-xl text-sm text-ink-700">Updates for your account, newest first. Read and unread stay here.</p>
      </header>
      {!ready ? <BrandLoader layout="section" label="Loading notifications" /> : null}
      {message ? <p className="text-sm text-ink-700">{message}</p> : null}
      {ready && !message && items.length === 0 ? (
        <EmptyState title="No notifications yet" body="Updates about your jobs and messages will show up here." />
      ) : null}
      {items.length > 0 ? (
        <ul className="space-y-2">
          {items.map((item) => {
            const title = safeNoticeTitle(item.title);
            const context = notificationProjectLine({
              projectTitle: item.projectTitle,
              referenceNumber: item.referenceNumber,
            });
            const body = safeNoticeText(title, item.body);
            const when = friendlyTimestamp(item.createdAt);
            return (
              <li key={item.id}>
                <Link
                  to={item.path}
                  className="block rounded-2xl border border-forest-800/10 px-4 py-3 text-sm"
                  onClick={() => onOpen(item)}
                >
                  <span className="flex items-start justify-between gap-3">
                    <span className={`font-semibold ${item.readAt ? "text-ink-700" : "text-forest-800"}`}>{title}</span>
                    <span className="flex shrink-0 items-center gap-2">
                      {item.actionState === "historical" ? (
                        <span className="text-xs font-semibold text-ink-500">Past</span>
                      ) : null}
                      {!item.readAt ? <span className="text-xs font-semibold text-gold-700">Unread</span> : null}
                    </span>
                  </span>
                  {context ? <span className="mt-1 block text-forest-800">{context}</span> : null}
                  {body ? <span className="mt-1 block text-ink-700">{body}</span> : null}
                  {when ? <span className="mt-1 block text-xs text-ink-500">{when}</span> : null}
                </Link>
              </li>
            );
          })}
        </ul>
      ) : null}
      <Link to={settingsPath} className="inline-flex min-h-11 items-center text-sm font-semibold text-forest-800 underline">
        Notification settings
      </Link>
    </div>
  );
}

class NotificationHistoryBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };

  static getDerivedStateFromError(): { failed: boolean } {
    return { failed: true };
  }

  render() {
    if (this.state.failed) {
      return (
        <NotificationHistoryView
          items={[]}
          ready
          loadError="Couldn't load notifications."
          settingsPath="/notifications"
          onOpen={() => undefined}
        />
      );
    }
    return this.props.children;
  }
}

function NotificationHistoryLive() {
  const { account_type, account_status } = useAuth();
  const { items, ready, loadError, markRead } = useNotifications();
  const settings = `${accountSettingsPath(account_type, account_status)}/notifications`;

  return (
    <NotificationHistoryView
      items={items}
      ready={ready}
      loadError={loadError}
      settingsPath={settings}
      onOpen={(item) => {
        if (!item.readAt) void markRead(item.id);
      }}
    />
  );
}

/** Every in-app notice, including ones already read. */
export function NotificationHistoryPage() {
  return (
    <NotificationHistoryBoundary>
      <NotificationHistoryLive />
    </NotificationHistoryBoundary>
  );
}
