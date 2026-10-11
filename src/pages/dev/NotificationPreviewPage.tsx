import { useSearchParams } from "react-router-dom";
import { CustomerEstimateHomeCards } from "../../components/marketplace/CustomerEstimateHomeCards";
import { NotificationPreviewProvider } from "../../components/notifications/NotificationBell";
import { NotificationSettings } from "../../components/notifications/NotificationSettings";
import { BottomNav } from "../../components/layout/BottomNav";
import { DashboardShell, type DashNavItem } from "../../components/layout/DashboardShell";
import { Header } from "../../components/layout/Header";
import { NotificationHistoryView } from "../app/NotificationHistoryPage";
import { ProNotificationsList } from "../app/pro/ProEstimatesPages";
import { AuthContext } from "../../lib/auth/AuthContext";
import { profileFor, signedInAuth } from "../../lib/auth/authFixture";
import type { AccountType } from "../../lib/auth/types";
import type { InAppNotification } from "../../lib/notifications/api";
import type { InAppNotificationRow } from "../../lib/marketplace/api";

const sampleItems: InAppNotification[] = [
  {
    id: "preview-declined",
    kind: "estimate.declined",
    title: "Order declined",
    body: "The homeowner declined this order after reviewing the proposed start date and access notes.",
    path: "/app/pro/estimates",
    projectTitle: "Fence repair",
    referenceNumber: 1004,
    readAt: null,
    createdAt: new Date(Date.now() - 8 * 60 * 1000).toISOString(),
    category: "estimates",
  },
  {
    id: "preview-approved",
    kind: "estimate.accepted",
    title: "Order approved",
    body: "Your order was approved. Open the booking to confirm the schedule with the customer.",
    path: "/app/pro/jobs/book-1",
    projectTitle: "Fence repair",
    referenceNumber: 1004,
    readAt: null,
    createdAt: new Date(Date.now() - 25 * 60 * 1000).toISOString(),
    category: "booking",
  },
  {
    id: "preview-message",
    kind: "message.received",
    title: "New message about a project with a very long title that should wrap onto the next line",
    body: "New message about your project.",
    path: "/app/pro/messages",
    projectTitle: "Interior paint",
    referenceNumber: 1008,
    readAt: null,
    createdAt: new Date(Date.now() - 40 * 60 * 1000).toISOString(),
    category: "messages",
  },
  {
    id: "preview-message-2",
    kind: "message.received",
    title: "New message",
    body: "New message about your project.",
    path: "/app/pro/messages",
    projectTitle: "Interior paint",
    referenceNumber: 1008,
    readAt: null,
    createdAt: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString(),
    category: "messages",
  },
  {
    id: "preview-shared",
    kind: "contact.shared",
    title: "Project contact shared with you",
    body: "A customer shared project contact with you so you can coordinate arrival and materials.",
    path: "/app/pro/jobs/book-2",
    projectTitle: "Deck stain",
    referenceNumber: 1012,
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
    projectTitle: "Interior paint",
    referenceNumber: 1008,
    actionState: "historical",
    readAt: new Date().toISOString(),
    createdAt: new Date(Date.now() - 26 * 60 * 60 * 1000).toISOString(),
    category: "new_job",
  },
];

const customerUpdateRows: InAppNotificationRow[] = [
  {
    id: "preview-estimate",
    kind: "estimate.received",
    title: "New estimate received",
    body: "A pro sent an estimate on your project.",
    entity_type: "estimates",
    entity_id: "est-1",
    payload: {
      project_id: "proj-1",
      estimate_id: "est-1",
      project_title: "Fence repair",
      project_reference_number: 1004,
    },
    channel: "in_app",
    read_at: null,
    created_at: new Date().toISOString(),
    action_state: "open",
  },
];

const proUpdateRows: InAppNotificationRow[] = [
  {
    id: "preview-change",
    kind: "change_order.approved",
    title: "Change order approved",
    body: "A change order on your project was approved.",
    entity_type: "change_orders",
    entity_id: "co-1",
    payload: {
      booking_id: "book-1",
      project_title: "Fence repair",
      project_reference_number: 1004,
      path: "/app/pro/bookings/book-1",
    },
    channel: "in_app",
    read_at: null,
    created_at: new Date().toISOString(),
    action_state: "open",
  },
];

const proItems: DashNavItem[] = [
  { to: "/app/pro", label: "Home", end: true },
  { to: "/app/pro/opportunities", label: "Jobs" },
  { to: "/app/pro/messages", label: "Messages" },
  { to: "/app/pro/estimates", label: "Estimates" },
  { to: "/app/pro/bookings", label: "Bookings" },
  { to: "/app/pro/profile", label: "Profile" },
];

const customerItems: DashNavItem[] = [
  { to: "/app/customer", label: "Home", end: true },
  { to: "/app/customer/projects", label: "Projects" },
  { to: "/app/customer/messages", label: "Messages" },
  { to: "/app/customer/bookings", label: "Bookings" },
  { to: "/app/customer/account", label: "Account" },
];

const adminItems: DashNavItem[] = [
  { to: "/app/admin", label: "Home", end: true },
  { to: "/app/admin/account", label: "Account" },
];

function roleFrom(value: string | null): AccountType {
  if (value === "customer") return "CUSTOMER";
  if (value === "admin") return "ADMIN";
  return "CONTRACTOR";
}

function settingsPath(role: AccountType): string {
  if (role === "CUSTOMER") return "/app/customer/account/notifications";
  if (role === "ADMIN") return "/app/admin/account/notifications";
  return "/app/pro/account/notifications";
}

export function NotificationPreviewPage() {
  const [params] = useSearchParams();
  const view = params.get("view") ?? "bell";
  const chrome = params.get("chrome") ?? "dashboard";
  const role = roleFrom(params.get("role"));
  const preview = { items: sampleItems, unread: sampleItems.filter((item) => !item.readAt).length, startOpen: view === "bell" };
  const auth = signedInAuth(role, {
    profile: {
      ...profileFor(role),
      first_name: role === "CONTRACTOR" ? "Garrett" : "Pat",
      last_name: role === "CONTRACTOR" ? "Pike" : "Lee",
      email: "pat@example.com",
    },
    user: { id: "user-1", email: "pat@example.com" } as ReturnType<typeof signedInAuth>["user"],
  });
  const items = role === "CUSTOMER" ? customerItems : role === "ADMIN" ? adminItems : proItems;
  const eyebrow = role === "CUSTOMER" ? "Customer" : role === "ADMIN" ? "Admin" : "Priority Pro";

  const body =
    view === "settings" ? (
      <NotificationSettings mode="preview" />
    ) : view === "ios" ? (
      <NotificationSettings mode="preview" forceIosGuide />
    ) : view === "history" || view === "history-empty" || view === "history-loading" ? (
      <NotificationHistoryView
        items={view === "history" ? sampleItems : []}
        ready={view !== "history-loading"}
        loadError={null}
        settingsPath={settingsPath(role)}
        onOpen={() => undefined}
      />
    ) : view === "updates" ? (
      role === "CONTRACTOR" ? (
        <ProNotificationsList previewRows={proUpdateRows} />
      ) : (
        <CustomerEstimateHomeCards previewRows={customerUpdateRows} />
      )
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
          <DashboardShell items={items} eyebrow={eyebrow}>
            {body}
          </DashboardShell>
        )}
      </NotificationPreviewProvider>
    </AuthContext.Provider>
  );
}
