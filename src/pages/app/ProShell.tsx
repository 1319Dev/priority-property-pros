import { HowFeesWork } from "../../components/marketplace/HowFeesWork";
import { DashboardShell, type DashNavItem } from "../../components/layout/DashboardShell";
import { useMessageUnreadCount } from "../../lib/marketplace/useMessageUnread";

const baseItems: DashNavItem[] = [
  { to: "/app/pro", label: "Home", end: true },
  { to: "/app/pro/opportunities", label: "Jobs" },
  { to: "/app/pro/messages", label: "Messages" },
  { to: "/app/pro/estimates", label: "Estimates" },
  { to: "/app/pro/bookings", label: "Bookings" },
  { to: "/app/pro/profile", label: "Profile" },
];

export function ProShell() {
  const unread = useMessageUnreadCount();
  const items = baseItems.map((item) =>
    item.to === "/app/pro/messages" ? { ...item, badge: unread } : item,
  );
  return <DashboardShell items={items} eyebrow="Priority Pro" notice={<HowFeesWork />} />;
}
