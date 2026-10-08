import { useSearchParams } from "react-router-dom";
import { NotificationPreviewProvider } from "../../components/notifications/NotificationBell";
import { NotificationSettings } from "../../components/notifications/NotificationSettings";
import { BottomNav } from "../../components/layout/BottomNav";
import { DashboardShell } from "../../components/layout/DashboardShell";
import { Header } from "../../components/layout/Header";
import { AuthContext } from "../../lib/auth/AuthContext";
import { profileFor, signedInAuth } from "../../lib/auth/authFixture";
import type { InAppNotification } from "../../lib/notifications/api";

const sampleItems: InAppNotification[] = [
  {
    id: "preview-declined",
    kind: "estimate.declined",
    title: "Order declined",
    body: "The homeowner declined this order after reviewing the proposed start date and access notes.",
    path: "/app/pro/estimates",
    readAt: null,
    createdAt: new Date(Date.now() - 8 * 60 * 1000).toISOString(),
    category: "estimates",
  },
  {
    id: "preview-approved",
    kind: "estimate.accepted",
    title: "Order approved",
    body: "Your order was approved. Open the booking to confirm the schedule with the customer.",
    path: "/app/pro/bookings",
    readAt: null,
    createdAt: new Date(Date.now() - 25 * 60 * 1000).toISOString(),
    category: "booking",
  },
  {
    id: "preview-message",
    kind: "message.received",
    title: "New message about a project with a very long title that should wrap onto the next line",
    body: "New message about a project. The customer asked whether the crew can arrive before the gate code changes at the end of the day.",
    path: "/app/pro/messages",
    readAt: null,
    createdAt: new Date(Date.now() - 40 * 60 * 1000).toISOString(),
    category: "messages",
  },
  {
    id: "preview-message-2",
    kind: "message.received",
    title: "New message",
    body: "You have a new message about a project.",
    path: "/app/pro/messages",
    readAt: null,
    createdAt: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString(),
    category: "messages",
  },
  {
    id: "preview-shared",
    kind: "contact.shared",
    title: "Project contact shared with you",
    body: "A customer shared project contact with you so you can coordinate arrival and materials.",
    path: "/app/pro/opportunities",
    readAt: null,
    createdAt: new Date(Date.now() - 5 * 60 * 60 * 1000).toISOString(),
    category: "connect",
  },
  {
    id: "preview-job",
    kind: "opportunity.offered",
    title: "New job offered",
    body: "A new job in your service area is ready to view. The scope covers interior paint on two stories.",
    path: "/app/pro/opportunities",
    readAt: new Date().toISOString(),
    createdAt: new Date(Date.now() - 26 * 60 * 60 * 1000).toISOString(),
    category: "new_job",
  },
];

const proItems = [
  { to: "/app/pro", label: "Home", end: true },
  { to: "/app/pro/opportunities", label: "Jobs" },
  { to: "/app/pro/messages", label: "Messages" },
  { to: "/app/pro/estimates", label: "Estimates" },
  { to: "/app/pro/bookings", label: "Bookings" },
  { to: "/app/pro/profile", label: "Profile" },
];

export function NotificationPreviewPage() {
  const [params] = useSearchParams();
  const view = params.get("view") ?? "bell";
  const chrome = params.get("chrome") ?? "dashboard";
  const preview = { items: sampleItems, unread: 5, startOpen: view === "bell" };
  const auth = signedInAuth("CONTRACTOR", {
    profile: {
      ...profileFor("CONTRACTOR"),
      first_name: "Garrett",
      last_name: "Pike",
      email: "garrett@example.com",
    },
    user: { id: "user-1", email: "garrett@example.com" } as ReturnType<typeof signedInAuth>["user"],
  });

  const body =
    view === "settings" ? (
      <NotificationSettings mode="preview" />
    ) : view === "ios" ? (
      <NotificationSettings mode="preview" forceIosGuide />
    ) : (
      <p className="max-w-xl text-sm leading-relaxed text-ink-700">
        Sample alerts use the same bell as the signed-in header. Open one to go to its page, or mark them read.
        Priority Property Pros does not collect payment or take a cut of the work.
      </p>
    );

  return (
    <AuthContext.Provider value={auth}>
      <NotificationPreviewProvider value={preview}>
        {chrome === "public" ? (
          <div className="paper-grain flex min-h-dvh flex-col">
            <Header />
            <main id="main" className="mx-auto w-full max-w-6xl flex-1 px-4 py-8 pb-40">
              {body}
            </main>
            <BottomNav />
          </div>
        ) : (
          <DashboardShell items={proItems} eyebrow="Priority Pro">
            {body}
          </DashboardShell>
        )}
      </NotificationPreviewProvider>
    </AuthContext.Provider>
  );
}
