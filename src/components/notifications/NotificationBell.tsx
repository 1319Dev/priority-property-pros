import { createContext, useContext, useEffect, useId, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { Link } from "react-router-dom";
import { useAuth } from "../../lib/auth/useAuth";
import { accountSettingsPath } from "../../lib/auth/roles";
import type { InAppNotification } from "../../lib/notifications/api";
import { useNotifications } from "../../lib/notifications/useNotifications";
import { noticeBody, noticeProjectLine } from "../../lib/marketplace/contractorPolish";
import { NARROW_NOTIFICATION_QUERY, dropdownRightInset } from "./notificationPanelLayout";

export type NotificationBellPreview = {
  items: InAppNotification[];
  unread: number;
  startOpen?: boolean;
};

const NotificationPreviewContext = createContext<NotificationBellPreview | null>(null);

export function NotificationPreviewProvider({
  value,
  children,
}: {
  value: NotificationBellPreview;
  children: ReactNode;
}) {
  return <NotificationPreviewContext.Provider value={value}>{children}</NotificationPreviewContext.Provider>;
}

function useNarrowScreen() {
  const [narrow, setNarrow] = useState(() => {
    if (typeof window === "undefined" || typeof window.matchMedia !== "function") return false;
    return window.matchMedia(NARROW_NOTIFICATION_QUERY).matches;
  });

  useEffect(() => {
    if (typeof window.matchMedia !== "function") return undefined;
    const media = window.matchMedia(NARROW_NOTIFICATION_QUERY);
    const onChange = () => setNarrow(media.matches);
    onChange();
    media.addEventListener("change", onChange);
    return () => media.removeEventListener("change", onChange);
  }, []);

  return narrow;
}

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

function CloseIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className="h-5 w-5">
      <path d="M6 6 L18 18 M18 6 L6 18" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  );
}

const PANEL_SHELL =
  "flex flex-col overflow-hidden rounded-3xl border border-forest-800/10 bg-cream-50 shadow-xl focus:outline-none";

/** Fixed sheet: 0.75rem side margins, just under the sticky header, above the bottom nav. */
const NARROW_PANEL =
  "fixed left-[0.75rem] right-[0.75rem] top-[calc(4rem+max(0.5rem,env(safe-area-inset-top))+1px)] z-[70] max-h-[calc(100dvh-4rem-max(0.5rem,env(safe-area-inset-top))-3.25rem-max(0.75rem,env(safe-area-inset-bottom))-2px)]";

/** Right edge lines up with the bell; width cannot exceed the viewport minus 1.5rem. */
const WIDE_PANEL =
  "absolute right-0 z-50 mt-2 w-[min(24rem,calc(100vw-1.5rem))] max-h-[min(70vh,calc(100dvh-4rem-max(0.5rem,env(safe-area-inset-top))-3.25rem-max(0.75rem,env(safe-area-inset-bottom))))] lg:max-h-[70vh]";

export function NotificationBell({ preview: previewProp }: { preview?: NotificationBellPreview }) {
  const inherited = useContext(NotificationPreviewContext);
  const preview = previewProp ?? inherited ?? undefined;
  const { user, account_type, account_status } = useAuth();
  const live = useNotifications({ enabled: !preview });
  const items = preview?.items ?? live.items;
  const unread = preview?.unread ?? live.unread;
  const [open, setOpen] = useState(Boolean(preview?.startOpen));
  const narrow = useNarrowScreen();
  const rootRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const wasOpen = useRef(false);
  const panelId = useId();
  const titleId = useId();
  const settingsTo = `${accountSettingsPath(account_type, account_status)}/notifications`;
  const historyTo =
    account_type === "CONTRACTOR"
      ? "/app/pro/notifications"
      : account_type === "CUSTOMER"
        ? "/app/customer/notifications"
        : settingsTo;

  useEffect(() => {
    if (!open) return undefined;
    const onPointer = (event: PointerEvent) => {
      const target = event.target;
      if (!(target instanceof Node)) return;
      if (rootRef.current?.contains(target)) return;
      if (panelRef.current?.contains(target)) return;
      setOpen(false);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    window.addEventListener("pointerdown", onPointer);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("pointerdown", onPointer);
      window.removeEventListener("keydown", onKey);
    };
  }, [open]);

  useEffect(() => {
    if (open) {
      wasOpen.current = true;
      panelRef.current?.focus({ preventScroll: true });
      return undefined;
    }
    if (wasOpen.current) {
      wasOpen.current = false;
      buttonRef.current?.focus({ preventScroll: true });
    }
    return undefined;
  }, [open, narrow]);

  useEffect(() => {
    if (!open || !narrow) return undefined;
    const body = document.body;
    const html = document.documentElement;
    const previous = {
      bodyOverflow: body.style.overflow,
      htmlOverflow: html.style.overflow,
      position: body.style.position,
      top: body.style.top,
      left: body.style.left,
      right: body.style.right,
      width: body.style.width,
    };
    const scrollY = window.scrollY;
    body.style.overflow = "hidden";
    html.style.overflow = "hidden";
    body.style.position = "fixed";
    body.style.top = `-${scrollY}px`;
    body.style.left = "0";
    body.style.right = "0";
    body.style.width = "100%";
    return () => {
      body.style.overflow = previous.bodyOverflow;
      html.style.overflow = previous.htmlOverflow;
      body.style.position = previous.position;
      body.style.top = previous.top;
      body.style.left = previous.left;
      body.style.right = previous.right;
      body.style.width = previous.width;
      window.scrollTo(0, scrollY);
    };
  }, [open, narrow]);

  useLayoutEffect(() => {
    if (!open || narrow) return undefined;
    const panel = panelRef.current;
    if (!panel) return undefined;
    const fit = () => {
      panel.style.right = "0px";
      const rect = panel.getBoundingClientRect();
      if (rect.width === 0) return;
      const inset = dropdownRightInset(rect.left);
      panel.style.right = inset === 0 ? "0px" : `${inset}px`;
    };
    fit();
    window.addEventListener("resize", fit);
    return () => window.removeEventListener("resize", fit);
  }, [open, narrow, items.length]);

  if (!preview && !user) return null;

  const label = unread > 0 ? `Notifications, ${unread} unread` : "Notifications";

  const panel = (
    <div
      ref={panelRef}
      id={panelId}
      role="dialog"
      aria-modal={narrow ? true : undefined}
      aria-labelledby={titleId}
      tabIndex={-1}
      className={`${PANEL_SHELL} ${narrow ? NARROW_PANEL : WIDE_PANEL}`}
    >
      <div className="flex shrink-0 flex-wrap items-center gap-x-3 gap-y-2 border-b border-forest-800/10 px-4 py-3">
        <h2 id={titleId} className="shrink-0 whitespace-nowrap font-display text-lg font-semibold text-forest-800">
          Notifications
        </h2>
        <div className="ml-auto flex shrink-0 items-center gap-1">
          {unread > 0 ? (
            <button
              type="button"
              className="shrink-0 whitespace-nowrap px-2 text-sm font-semibold text-forest-800 underline-offset-4 hover:underline"
              onClick={() => {
                if (preview) return;
                void live.markAllRead();
              }}
            >
              Mark all read
            </button>
          ) : null}
          {narrow ? (
            <button
              type="button"
              className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-forest-800 hover:bg-forest-800/8"
              aria-label="Close notifications"
              onClick={() => setOpen(false)}
            >
              <CloseIcon />
            </button>
          ) : null}
        </div>
      </div>
      <ul className="min-h-0 overflow-y-auto overscroll-contain">
        {items.length === 0 ? (
          <li className="px-4 py-8 text-sm text-ink-500">
            {preview || live.ready ? (live.loadError && !preview ? live.loadError : "You're all caught up.") : "Loading notifications…"}
          </li>
        ) : (
          items.map((item) => (
            <li key={item.id} className="border-b border-forest-800/5 last:border-b-0">
              <Link
                to={item.path}
                className="flex min-h-16 min-w-0 flex-col gap-1 px-4 py-3 hover:bg-cream-100"
                onClick={() => {
                  setOpen(false);
                  if (!preview && !item.readAt) void live.markRead(item.id);
                }}
              >
                <span className="flex min-w-0 items-start justify-between gap-3">
                  <span className={`min-w-0 flex-1 break-words text-sm font-semibold ${item.readAt ? "text-ink-700" : "text-forest-800"}`}>
                    {item.title}
                  </span>
                  {!item.readAt ? <span className="mt-1 h-2.5 w-2.5 shrink-0 rounded-full bg-gold-500" aria-hidden="true" /> : null}
                </span>
                {noticeProjectLine({
                  project_title: item.projectTitle,
                  reference_number: item.referenceNumber,
                }) ? (
                  <span className="break-words text-sm font-medium text-forest-800">
                    {noticeProjectLine({
                      project_title: item.projectTitle,
                      reference_number: item.referenceNumber,
                    })}
                  </span>
                ) : null}
                {noticeBody(item.title, item.body) ? (
                  <span className="break-words text-sm leading-snug text-ink-500">{noticeBody(item.title, item.body)}</span>
                ) : null}
                <span className="text-xs text-ink-300">{relativeTime(item.createdAt)}</span>
              </Link>
            </li>
          ))
        )}
      </ul>
      <Link
        to={historyTo}
        className="shrink-0 border-t border-forest-800/10 px-4 py-3 text-center text-sm font-semibold text-forest-800 hover:bg-cream-100"
        onClick={() => setOpen(false)}
      >
        Notification history
      </Link>
      <Link
        to={account_type ? settingsTo : "/notifications"}
        className="shrink-0 border-t border-forest-800/10 px-4 py-3 text-center text-sm font-semibold text-forest-800 hover:bg-cream-100"
        onClick={() => setOpen(false)}
      >
        Notification settings
      </Link>
    </div>
  );

  return (
    <div className="relative shrink-0" ref={rootRef}>
      <button
        ref={buttonRef}
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
      {open && narrow
        ? createPortal(
            <>
              <button
                type="button"
                tabIndex={-1}
                aria-label="Dismiss notifications"
                className="fixed inset-0 z-[60] bg-forest-950/20"
                onPointerDown={(event) => event.stopPropagation()}
                onClick={() => setOpen(false)}
              />
              {panel}
            </>,
            document.body,
          )
        : null}
      {open && !narrow ? panel : null}
    </div>
  );
}
