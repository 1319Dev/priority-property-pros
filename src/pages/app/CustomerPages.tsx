import { EmptyState } from "../../components/layout/DashboardShell";

export { CustomerHomePage, CustomerProjectsPage } from "./customer/CustomerMarketplacePages";
export { AccountPage } from "./AccountSettingsPages";

export function CustomerMessagesPage() {
  return (
    <EmptyState
      title="No messages"
      body="Messaging is not built yet. You will not miss a job update because none can be sent."
    />
  );
}
