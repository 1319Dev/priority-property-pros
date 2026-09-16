import { DashboardShell } from "../../components/layout/DashboardShell";

const items = [
  { to: "/app/verifier", label: "Home", end: true },
  { to: "/app/verifier/visits", label: "Visits" },
  { to: "/app/verifier/messages", label: "Messages" },
  { to: "/app/verifier/account", label: "Account" },
];

export function VerifierShell() {
  return <DashboardShell items={items} eyebrow="Verifier" />;
}
