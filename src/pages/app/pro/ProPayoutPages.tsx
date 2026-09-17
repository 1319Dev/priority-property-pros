import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { TransferStatusList } from "../../../components/payments/SchedulePanel";
import { EmptyState } from "../../../components/layout/DashboardShell";
import { Button } from "../../../components/ui/Button";
import { FormError } from "../../../lib/auth/AuthCard";
import { useAuth } from "../../../lib/auth/useAuth";
import { fetchContractorProfileByUser } from "../../../lib/marketplace/api";
import { fetchMyConnectAccount, fetchMyTransfers, startConnectOnboarding } from "../../../lib/payments/api";
import { contractorCanReceiveTransfers } from "../../../lib/payments/connect";
import { noInstantPayoutCopy } from "../../../lib/payments/schedules";
import type { ConnectAccountStatus, ContractorStripeAccount, ContractorTransfer } from "../../../lib/payments/types";

const STATUS_COPY: Record<ConnectAccountStatus, string> = {
  NOT_STARTED: "Payouts are not set up yet. You can still take jobs.",
  ONBOARDING: "Stripe onboarding is in progress.",
  RESTRICTED: "Stripe needs more information before payouts can be sent.",
  READY: "Payouts can be sent when a transfer is eligible.",
  DISABLED: "This connected account is disabled.",
};

export function ProPayoutsPage() {
  const { user } = useAuth();
  const [params] = useSearchParams();
  const [error, setError] = useState<string | null>(null);
  const [account, setAccount] = useState<ContractorStripeAccount | null>(null);
  const [transfers, setTransfers] = useState<ContractorTransfer[]>([]);
  const [busy, setBusy] = useState(false);

  async function reload(contractorId: string) {
    setAccount(await fetchMyConnectAccount(contractorId));
    setTransfers((await fetchMyTransfers(contractorId)) as ContractorTransfer[]);
  }

  useEffect(() => {
    if (!user) return;
    void fetchContractorProfileByUser(user.id)
      .then((profile) => {
        if (!profile) throw new Error("Contractor profile missing.");
        return reload(profile.id);
      })
      .catch((err: Error) => setError(err.message));
  }, [user]);

  const status = account?.status ?? "NOT_STARTED";

  return (
    <div className="space-y-6">
      <h1 className="font-display text-4xl font-semibold text-forest-800">Payouts</h1>
      <p className="text-sm text-ink-700">{STATUS_COPY[status]}</p>
      <p className="text-sm text-ink-700">{noInstantPayoutCopy()}</p>
      {params.get("onboarding") === "return" ? (
        <p className="rounded-3xl bg-cream-100 px-5 py-4 text-sm">
          Returned from Stripe. Status is synced from Stripe capabilities, not from this screen.
        </p>
      ) : null}
      <FormError message={error} />
      <p className="text-sm">
        Connect status: <span className="font-semibold">{status.replaceAll("_", " ")}</span>
        {contractorCanReceiveTransfers(status) ? " · can receive transfers" : " · cannot receive transfers yet"}
      </p>
      {status !== "DISABLED" ? (
        <Button
          type="button"
          className="min-h-14 w-full"
          disabled={busy}
          onClick={() => {
            setBusy(true);
            void startConnectOnboarding()
              .then((result) => {
                const url = String(result.url ?? "");
                if (!url) throw new Error("Stripe onboarding did not return a URL.");
                window.location.assign(url);
              })
              .catch((err: Error) => {
                setError(err.message);
                setBusy(false);
              });
          }}
        >
          Set up payouts
        </Button>
      ) : null}
      <TransferStatusList rows={transfers} />
      {transfers.length === 0 ? (
        <EmptyState title="Nothing available" body="Successful customer payments are held until they become eligible. Held money is never shown as available." />
      ) : null}
    </div>
  );
}
