import { DashboardShell, type DashNavItem } from "../../components/layout/DashboardShell";
import { useMessageUnreadCount } from "../../lib/marketplace/useMessageUnread";

const baseItems: DashNavItem[] = [
  { to: "/app/customer", label: "Home", end: true },
  { to: "/app/customer/projects", label: "Projects" },
  { to: "/app/customer/messages", label: "Messages" },
  { to: "/app/customer/bookings", label: "Bookings" },
  { to: "/app/customer/hire-again", label: "Hire again" },
  { to: "/app/customer/account", label: "Account" },
];

export function CustomerShell() {
  const unread = useMessageUnreadCount();

  const items = baseItems.map((item) =>
    item.to === "/app/customer/messages" ? { ...item, badge: unread } : item,
  );

  return <DashboardShell items={items} eyebrow="Customer" />;
}
