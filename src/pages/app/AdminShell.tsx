import { DashboardShell } from "../../components/layout/DashboardShell";

const items = [
  { to: "/app/admin", label: "Overview", end: true },
  { to: "/app/admin/people", label: "People" },
  { to: "/app/admin/approvals", label: "Approvals" },
  { to: "/app/admin/audit", label: "Audit" },
  { to: "/app/admin/account", label: "Account" },
];

export function AdminShell() {
  return <DashboardShell items={items} eyebrow="Admin" />;
}
