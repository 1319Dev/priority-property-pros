import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { EmptyState } from "../../components/layout/DashboardShell";
import { DeleteAccountDialog } from "../../components/account/DeleteAccountDialog";
import { useAuth } from "../../lib/auth/useAuth";
import { deleteOwnAccount } from "../../lib/auth/deleteAccount";
import { CUSTOMER_DASHBOARD_PRICING_NOTE, PRO_DASHBOARD_PRICING_NOTE } from "../../data/pricing";
import { Button } from "../../components/ui/Button";
import { accountStatusLabel, accountTypeLabel } from "../../lib/marketplace/statusLabels";

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
  const navigate = useNavigate();
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  return (
    <div className="max-w-lg space-y-6">
      <header>
        <p className="text-[0.72rem] font-semibold uppercase tracking-[0.22em] text-gold-600">Account</p>
        <h1 className="mt-2 font-display text-4xl font-semibold text-forest-800">Your profile</h1>
      </header>
      <dl className="space-y-3 rounded-3xl border border-forest-800/10 bg-cream-50 px-5 py-4 text-sm">
        <Row label="Name" value={`${profile?.first_name ?? ""} ${profile?.last_name ?? ""}`.trim() || "—"} />
        <Row label="Email" value={user?.email ?? profile?.email ?? "—"} />
        <Row label="Role" value={accountTypeLabel(account_type)} />
        <Row label="Status" value={accountStatusLabel(account_status)} />
      </dl>
      <p className="text-sm text-ink-500">
        Role and status are stored in the database. This website cannot promote anyone to Admin.
        {account_type === "CUSTOMER" ? ` ${CUSTOMER_DASHBOARD_PRICING_NOTE}` : ""}
        {account_type === "CONTRACTOR" ? ` ${PRO_DASHBOARD_PRICING_NOTE}` : ""}
      </p>
      <div className="flex flex-col gap-3">
        <Button
          type="button"
          variant="outline"
          onClick={() => {
            void signOut().then(() => navigate("/", { replace: true }));
          }}
        >
          Sign out
        </Button>
        <Button
          type="button"
          variant="ghost"
          className="text-danger-600"
          onClick={() => {
            setError(null);
            setDeleteOpen(true);
          }}
        >
          Delete account
        </Button>
      </div>
      <DeleteAccountDialog
        open={deleteOpen}
        busy={busy}
        error={error}
        onClose={() => {
          if (busy) return;
          setDeleteOpen(false);
          setError(null);
        }}
        onConfirm={() => {
          setBusy(true);
          setError(null);
          void deleteOwnAccount()
            .then(async (result) => {
              if (result.error) {
                setError(result.error);
                return;
              }
              await signOut();
              setDeleteOpen(false);
              navigate("/", { replace: true });
            })
            .finally(() => setBusy(false));
        }}
      />
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
