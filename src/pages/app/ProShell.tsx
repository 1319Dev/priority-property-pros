import { DashboardShell } from "../../components/layout/DashboardShell";

const items = [
  { to: "/app/pro", label: "Home", end: true },
  { to: "/app/pro/opportunities", label: "Jobs" },
  { to: "/app/pro/estimates", label: "Estimates" },
  { to: "/app/pro/bookings", label: "Bookings" },
  { to: "/app/pro/profile", label: "Profile" },
];

export function ProShell() {
  return <DashboardShell items={items} eyebrow="Priority Pro" />;
}
