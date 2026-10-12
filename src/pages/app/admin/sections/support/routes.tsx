import { lazy } from "react";
import { Route } from "react-router-dom";

const AdminSupportQueuePage = lazy(() => import("../../SupportPages").then((mod) => ({ default: mod.AdminSupportQueuePage })));
const AdminSupportConversationPage = lazy(() =>
  import("../../SupportPages").then((mod) => ({ default: mod.AdminSupportConversationPage })),
);
const AdminSupportKnowledgePage = lazy(() =>
  import("../../SupportPages").then((mod) => ({ default: mod.AdminSupportKnowledgePage })),
);
const AdminSupportAnalyticsPage = lazy(() =>
  import("../../SupportPages").then((mod) => ({ default: mod.AdminSupportAnalyticsPage })),
);

export const adminSectionRoutes = [
  <Route key="support" path="support" element={<AdminSupportQueuePage />} />,
  <Route key="support-kb" path="support/kb" element={<AdminSupportKnowledgePage />} />,
  <Route key="support-analytics" path="support/analytics" element={<AdminSupportAnalyticsPage />} />,
  <Route key="support-conversation" path="support/:conversationId" element={<AdminSupportConversationPage />} />,
];
