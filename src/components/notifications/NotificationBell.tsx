import { useEffect, useId, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "../../lib/auth/useAuth";
import { accountSettingsPath } from "../../lib/auth/roles";
import type { InAppNotification } from "../../lib/notifications/api";
import { useNotifications } from "../../lib/notifications/useNotifications";

export type NotificationBellPreview = {
  items: InAppNotification[];
  unread: number;
  startOpen?: boolean;
};

function relativeTime(iso: string): string {
  const minutes = Math.round((Date.now() - Date.parse(iso)) / 60000);
  if (!Number.isFinite(minutes) || minutes < 1) return "Just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.round(hours / 24)}d ago`;
}

function BellIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className="h-5 w-5">
      <path
        d="M12 3.5a5 5 0 0 0-5 5v2.2c0 .7-.2 1.4-.7 2L4.6 14.8A1.2 1.2 0 0 0 5.6 16.8h12.8a1.2 1.2 0 0 0 1-1.9l-1.7-2.1a3.4 3.4 0 0 1-.7-2V8.5a5 5 0 0 0-5-5Z"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinejoin="round"
      />
      <path d="M9.5 17.2a2.5 2.5 0 0 0 5 0" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  );
}

export function NotificationBell({ preview }: { preview?: NotificationBellPreview }) {
  const { user, account_type, account_status } = useAuth();
  const live = useNotifications({ enabled: !preview });
  const items = preview?.items ?? live.items;
  const unread = preview?.unread ?? live.unread;
  const [open, setOpen] = useState(Boolean(preview?.startOpen));
  const rootRef = useRef<HTMLDivElement>(null);
  const panelId = useId();
  const settingsTo = `${accountSettingsPath(account_type, account_status)}/notifications`;

  useEffect(() => {
    if (!open) return undefined;
    const onPointer = (event: MouseEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    window.addEventListener("mousedown", onPointer);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("mousedown", onPointer);
      window.removeEventListener("keydown", onKey);
    };
  }, [open]);

  if (!preview && !user) return null;

  const label = unread > 0 ? `Notifications, ${unread} unread` : "Notifications";

  return (
    <div className="relative" ref={rootRef}>
      <button
        type="button"
        className="relative inline-flex h-11 w-11 items-center justify-center rounded-full text-forest-800 hover:bg-forest-800/8"
        aria-label={label}
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-controls={panelId}
        onClick={() => setOpen((current) => !current)}
      >
        <BellIcon />
        {unread > 0 ? (
          <span className="absolute right-1 top-1 grid min-h-5 min-w-5 place-items-center rounded-full bg-gold-500 px-1 text-[0.65rem] font-bold text-forest-950">
            {unread > 9 ? "9+" : unread}
          </span>
        ) : null}
      </button>
      {open ? (
        <div
          id={panelId}
          role="dialog"
          aria-label="Notifications"
          className="absolute right-0 z-50 mt-2 flex max-h-[70vh] w-[min(22rem,calc(100vw-1.5rem))] flex-col overflow-hidden rounded-3xl border border-forest-800/10 bg-cream-50 shadow-xl"
        >
          <div className="flex items-center justify-between gap-3 border-b border-forest-800/10 px-4 py-3">
            <h2 className="font-display text-lg font-semibold text-forest-800">Notifications</h2>
            {unread > 0 ? (
              <button
                type="button"
                className="text-sm font-semibold text-forest-800 underline-offset-4 hover:underline"
                onClick={() => {
                  if (preview) return;
                  void live.markAllRead();
                }}
              >
                Mark all read
              </button>
            ) : null}
          </div>
          <ul className="overflow-y-auto">
            {items.length === 0 ? (
              <li className="px-4 py-8 text-sm text-ink-500">You're all caught up.</li>
            ) : (
              items.map((item) => (
                <li key={item.id} className="border-b border-forest-800/5 last:border-b-0">
                  <Link
                    to={item.path}
                    className="flex min-h-16 flex-col gap-1 px-4 py-3 hover:bg-cream-100"
                    onClick={() => {
                      setOpen(false);
                      if (!preview && !item.readAt) void live.markRead(item.id);
                    }}
                  >
                    <span className="flex items-start justify-between gap-3">
                      <span className={`text-sm font-semibold ${item.readAt ? "text-ink-700" : "text-forest-800"}`}>
                        {item.title}
                      </span>
                      {!item.readAt ? <span className="mt-1 h-2.5 w-2.5 shrink-0 rounded-full bg-gold-500" aria-hidden="true" /> : null}
                    </span>
                    <span className="text-sm leading-snug text-ink-500">{item.body}</span>
                    <span className="text-xs text-ink-300">{relativeTime(item.createdAt)}</span>
                  </Link>
                </li>
              ))
            )}
          </ul>
          <Link
            to={account_type ? settingsTo : "/notifications"}
            className="border-t border-forest-800/10 px-4 py-3 text-center text-sm font-semibold text-forest-800 hover:bg-cream-100"
            onClick={() => setOpen(false)}
          >
            Notification settings
          </Link>
        </div>
      ) : null}
    </div>
  );
}
