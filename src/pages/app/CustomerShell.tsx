import { DashboardShell } from "../../components/layout/DashboardShell";

const items = [
  { to: "/app/customer", label: "Home", end: true },
  { to: "/app/customer/projects", label: "Projects" },
  { to: "/app/customer/messages", label: "Messages" },
  { to: "/app/customer/account", label: "Account" },
];

export function CustomerShell() {
  return <DashboardShell items={items} eyebrow="Customer" />;
}
