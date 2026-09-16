import { DashboardShell } from "../../components/layout/DashboardShell";

const items = [
  { to: "/app/pro", label: "Home", end: true },
  { to: "/app/pro/jobs", label: "Jobs" },
  { to: "/app/pro/messages", label: "Messages" },
  { to: "/app/pro/account", label: "Account" },
];

export function ProShell() {
  return <DashboardShell items={items} eyebrow="Priority Pro" />;
}
