import { EmptyState } from "../../components/layout/DashboardShell";
import { useAuth } from "../../lib/auth/useAuth";
import { Button } from "../../components/ui/Button";

export { CustomerHomePage, CustomerProjectsPage } from "./customer/CustomerMarketplacePages";

export function CustomerMessagesPage() {
  return (
    <EmptyState
      title="No messages"
      body="Messaging is not built yet. You will not miss a job update because none can be sent."
    />
  );
}

export function AccountPage() {
  const { profile, user, signOut, account_type, account_status } = useAuth();
  return (
    <div className="max-w-lg space-y-6">
      <header>
        <p className="text-[0.72rem] font-semibold uppercase tracking-[0.22em] text-gold-600">Account</p>
        <h1 className="mt-2 font-display text-4xl font-semibold text-forest-800">Your profile</h1>
      </header>
      <dl className="space-y-3 rounded-3xl border border-forest-800/10 bg-cream-50 px-5 py-4 text-sm">
        <Row label="Name" value={`${profile?.first_name ?? ""} ${profile?.last_name ?? ""}`.trim() || "—"} />
        <Row label="Email" value={user?.email ?? profile?.email ?? "—"} />
        <Row label="Role" value={account_type ?? "—"} />
        <Row label="Status" value={account_status ?? "—"} />
      </dl>
      <p className="text-sm text-ink-500">
        Role and status are stored in the database. The website cannot promote anyone to Admin.
      </p>
      <Button type="button" variant="outline" onClick={() => void signOut()}>
        Sign out
      </Button>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-4">
      <dt className="font-semibold uppercase tracking-[0.14em] text-gold-700">{label}</dt>
      <dd className="text-ink-900">{value}</dd>
    </div>
  );
}
