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
        <p className="text-[0.72rem] font-semibold uppercase tracking-[0.22em] text-gold-600">Settings</p>
        <h1 className="mt-2 font-display text-4xl font-semibold text-forest-800">Account settings</h1>
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
      <Button
        type="button"
        variant="outline"
        onClick={() => {
          void signOut().then(() => navigate("/", { replace: true }));
        }}
      >
        Sign out
      </Button>
      <section className="border-t border-forest-800/10 pt-8">
        <h2 className="text-sm font-semibold text-ink-500">Delete account</h2>
        <p className="mt-2 text-sm leading-relaxed text-ink-500">
          Permanently close this account and remove your profile. This cannot be undone.
        </p>
        <button
          type="button"
          className="mt-4 min-h-11 text-left text-sm text-danger-600/70 underline-offset-4 hover:text-danger-600 hover:underline"
          onClick={() => {
            setError(null);
            setDeleteOpen(true);
          }}
        >
          Delete account
        </button>
      </section>
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
