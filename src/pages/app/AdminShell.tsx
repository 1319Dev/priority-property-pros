import { useEffect, useState } from "react";
import { useLocation } from "react-router-dom";
import { DashboardShell } from "../../components/layout/DashboardShell";
import { subscribeApprovalsChanged } from "../../lib/admin/approvals";
import { countPendingContractorApprovals } from "../../lib/admin/approvalsApi";

export function AdminShell() {
  const location = useLocation();
  const [pendingCount, setPendingCount] = useState(0);

  useEffect(() => {
    let stop = false;
    const refresh = () => {
      void countPendingContractorApprovals()
        .then((count) => {
          if (!stop) setPendingCount(count);
        })
        .catch(() => {
          if (!stop) setPendingCount(0);
        });
    };
    refresh();
    const unsubscribe = subscribeApprovalsChanged(refresh);
    return () => {
      stop = true;
      unsubscribe();
    };
  }, [location.pathname]);

  const items = [
    { to: "/app/admin", label: "Overview", end: true },
    { to: "/app/admin/bookings", label: "Bookings" },
    { to: "/app/admin/approvals", label: "Approvals", badge: pendingCount },
    { to: "/app/admin/reviews", label: "Reviews" },
    { to: "/app/admin/account", label: "Account" },
    { to: "/app/admin/people", label: "People" },
  ];

  return <DashboardShell items={items} eyebrow="Admin" />;
}
