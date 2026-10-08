import { useSearchParams } from "react-router-dom";
import { Logo } from "../../components/brand/Logo";
import { NotificationBell } from "../../components/notifications/NotificationBell";
import { NotificationSettings } from "../../components/notifications/NotificationSettings";
import type { InAppNotification } from "../../lib/notifications/api";

const sampleItems: InAppNotification[] = [
  {
    id: "preview-job",
    kind: "opportunity.offered",
    title: "New job offered",
    body: "A new job in your service area is ready to view.",
    path: "/app/pro/opportunities",
    readAt: null,
    createdAt: new Date(Date.now() - 5 * 60 * 1000).toISOString(),
    category: "new_job",
  },
  {
    id: "preview-message",
    kind: "message.received",
    title: "New message",
    body: "New message from a customer.",
    path: "/app/pro/messages",
    readAt: null,
    createdAt: new Date(Date.now() - 40 * 60 * 1000).toISOString(),
    category: "messages",
  },
  {
    id: "preview-connect",
    kind: "connect.paid",
    title: "A pro connected",
    body: "A pro connected on your project.",
    path: "/app/customer/projects",
    readAt: new Date().toISOString(),
    createdAt: new Date(Date.now() - 26 * 60 * 60 * 1000).toISOString(),
    category: "connect",
  },
];

export function NotificationPreviewPage() {
  const [params] = useSearchParams();
  const view = params.get("view") ?? "bell";

  return (
    <div className="min-h-dvh bg-cream-50 text-ink-900">
      <header className="sticky top-0 z-40 border-b border-forest-800/10 bg-cream-50/90 backdrop-blur-md">
        <div className="mx-auto flex min-h-16 max-w-6xl items-center justify-between px-4">
          <Logo />
          <NotificationBell preview={{ items: sampleItems, unread: 2, startOpen: view === "bell" }} />
        </div>
      </header>
      <main className="mx-auto max-w-6xl px-4 py-8">
        {view === "settings" ? <NotificationSettings mode="preview" /> : null}
        {view === "ios" ? <NotificationSettings mode="preview" forceIosGuide /> : null}
        {view === "bell" ? (
          <p className="max-w-xl text-sm text-ink-500">
            Sample alerts use the same bell as the signed-in header. Open one to go to its page, or mark them read.
          </p>
        ) : null}
      </main>
    </div>
  );
}
