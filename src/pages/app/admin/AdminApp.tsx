import { Navigate, Route, Routes } from "react-router-dom";
import { AccountPage } from "../CustomerPages";
import { NotificationSettingsPage } from "../NotificationSettingsPage";
import { AdminShell } from "../AdminShell";
import {
  AdminApprovalDetailPage,
  AdminApprovalsPage,
  AdminBookingsPage,
  AdminHomePage,
  AdminReviewsPage,
} from "../AdminPages";
import { AdminTwoFactorPage } from "./AdminTwoFactorPage";

/** Admin route tree. Loaded with React.lazy so the public site does not ship this bundle. */
export default function AdminApp() {
  return (
    <Routes>
      <Route element={<AdminShell />}>
        <Route index element={<AdminHomePage />} />
        <Route path="approvals" element={<AdminApprovalsPage />} />
        <Route path="approvals/:contractorProfileId" element={<AdminApprovalDetailPage />} />
        <Route path="reviews" element={<AdminReviewsPage />} />
        <Route path="bookings" element={<AdminBookingsPage />} />
        <Route path="security" element={<AdminTwoFactorPage />} />
        <Route path="account" element={<AccountPage />} />
        <Route path="account/notifications" element={<NotificationSettingsPage />} />
        <Route path="*" element={<Navigate to="/app/admin" replace />} />
      </Route>
    </Routes>
  );
}
