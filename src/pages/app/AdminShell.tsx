import { useEffect, useState } from "react";
import { useLocation } from "react-router-dom";
import { AdminLayout } from "../../components/admin/AdminLayout";
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

  return <AdminLayout pendingApprovals={pendingCount} />;
}
