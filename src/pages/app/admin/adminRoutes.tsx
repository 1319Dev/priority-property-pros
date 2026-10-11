import { lazy, type ReactElement } from "react";
import { Route } from "react-router-dom";
import { AccountPage } from "../CustomerPages";
import { NotificationSettingsPage } from "../NotificationSettingsPage";

const AdminHomePage = lazy(() => import("../AdminPages").then((mod) => ({ default: mod.AdminHomePage })));
const AdminApprovalsPage = lazy(() => import("../AdminPages").then((mod) => ({ default: mod.AdminApprovalsPage })));
const AdminApprovalDetailPage = lazy(() =>
  import("../AdminPages").then((mod) => ({ default: mod.AdminApprovalDetailPage })),
);
const AdminReviewsPage = lazy(() => import("../AdminPages").then((mod) => ({ default: mod.AdminReviewsPage })));
const AdminBookingsPage = lazy(() => import("../AdminPages").then((mod) => ({ default: mod.AdminBookingsPage })));
const AdminTwoFactorPage = lazy(() => import("./AdminTwoFactorPage").then((mod) => ({ default: mod.AdminTwoFactorPage })));

type RouteModule = {
  adminSectionRoutes?: ReactElement[];
};

const routeModules = import.meta.glob("./sections/*/routes.tsx", { eager: true }) as Record<string, RouteModule>;

/** Later admin PRs add ./sections/<name>/routes.tsx. This file stays the registry. */
export const adminExtensionRoutes: ReactElement[] = Object.keys(routeModules)
  .sort()
  .flatMap((key) => routeModules[key]?.adminSectionRoutes ?? []);

export const adminChildRoutes: ReactElement[] = [
  <Route key="index" index element={<AdminHomePage />} />,
  <Route key="approvals" path="approvals" element={<AdminApprovalsPage />} />,
  <Route key="approval-detail" path="approvals/:contractorProfileId" element={<AdminApprovalDetailPage />} />,
  <Route key="reviews" path="reviews" element={<AdminReviewsPage />} />,
  <Route key="bookings" path="bookings" element={<AdminBookingsPage />} />,
  <Route key="security" path="security" element={<AdminTwoFactorPage />} />,
  <Route key="account" path="account" element={<AccountPage />} />,
  <Route key="account-notifications" path="account/notifications" element={<NotificationSettingsPage />} />,
  ...adminExtensionRoutes,
];
