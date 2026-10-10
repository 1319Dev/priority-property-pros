import { Link } from "react-router-dom";
import { BrandLoader } from "../../components/brand/BrandLoader";
import { EmptyState } from "../../components/layout/DashboardShell";
import { friendlyTimestamp, noticeBody, noticeProjectLine } from "../../lib/marketplace/contractorPolish";
import { useNotifications } from "../../lib/notifications/useNotifications";
import { accountSettingsPath } from "../../lib/auth/roles";
import { useAuth } from "../../lib/auth/useAuth";

/** Every in-app notice, including ones already read. */
export function NotificationHistoryPage() {
  const { account_type, account_status } = useAuth();
  const { items, ready, loadError } = useNotifications();
  const settings = `${accountSettingsPath(account_type, account_status)}/notifications`;

  return (
    <div className="space-y-6">
      <header>
        <h1 className="font-display text-4xl font-semibold text-forest-800">Notification history</h1>
        <p className="mt-2 max-w-xl text-sm text-ink-700">Updates for your account, newest first. Read and unread stay here.</p>
      </header>
      {!ready ? <BrandLoader layout="section" label="Loading notifications" /> : null}
      {loadError ? <p className="text-sm text-ink-700">{loadError}</p> : null}
      {ready && !loadError && items.length === 0 ? (
        <EmptyState title="No notifications yet" body="Updates about your jobs and messages will show up here." />
      ) : null}
      {items.length > 0 ? (
        <ul className="space-y-2">
          {items.map((item) => {
            const context = noticeProjectLine({
              project_title: item.projectTitle,
              reference_number: item.referenceNumber,
            });
            const body = noticeBody(item.title, item.body);
            const when = friendlyTimestamp(item.createdAt);
            return (
              <li key={item.id}>
                <Link to={item.path} className="block rounded-2xl border border-forest-800/10 px-4 py-3 text-sm">
                  <span className="flex items-start justify-between gap-3">
                    <span className={`font-semibold ${item.readAt ? "text-ink-700" : "text-forest-800"}`}>{item.title}</span>
                    {!item.readAt ? <span className="text-xs font-semibold text-gold-700">Unread</span> : null}
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
      <Link to={settings} className="inline-flex min-h-11 items-center text-sm font-semibold text-forest-800 underline">
        Notification settings
      </Link>
    </div>
  );
}
