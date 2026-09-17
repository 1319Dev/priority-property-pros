import { useEffect, useState } from "react";
import { useLocation } from "react-router-dom";
import { DashboardShell } from "../../components/layout/DashboardShell";
import { countPendingContractorApprovals } from "../../lib/admin/approvalsApi";

export function AdminShell() {
  const location = useLocation();
  const [pendingCount, setPendingCount] = useState(0);

  useEffect(() => {
    void countPendingContractorApprovals()
      .then(setPendingCount)
      .catch(() => setPendingCount(0));
  }, [location.pathname]);

  const items = [
    { to: "/app/admin", label: "Overview", end: true },
    { to: "/app/admin/bookings", label: "Bookings" },
    { to: "/app/admin/people", label: "People" },
    { to: "/app/admin/approvals", label: "Approvals", badge: pendingCount },
    { to: "/app/admin/account", label: "Account" },
  ];

  return <DashboardShell items={items} eyebrow="Admin" />;
}
