import { DashboardShell } from "../../components/layout/DashboardShell";

const items = [
  { to: "/app/pro", label: "Home", end: true },
  { to: "/app/pro/opportunities", label: "Jobs" },
  { to: "/app/pro/bookings", label: "Bookings" },
  { to: "/app/pro/onboarding", label: "Profile" },
  { to: "/app/pro/account", label: "Account" },
];

export function ProShell() {
  return <DashboardShell items={items} eyebrow="Priority Pro" />;
}
