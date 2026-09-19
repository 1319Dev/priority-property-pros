import { EmptyState } from "../../components/layout/DashboardShell";
import { displayName } from "../../lib/auth/roles";
import { useAuth } from "../../lib/auth/useAuth";

export function VerifierHomePage() {
  const { profile } = useAuth();
  const name = profile ? displayName(profile.first_name, profile.last_name, profile.email) : "Verifier";
  return (
    <div className="space-y-6">
      <header>
        <p className="text-[0.72rem] font-semibold uppercase tracking-[0.22em] text-gold-600">Verifier</p>
        <h1 className="mt-2 font-display text-4xl font-semibold text-forest-800">{name}</h1>
        <p className="mt-3 max-w-xl text-ink-700">
          This dashboard is a shell so verifier accounts can sign in. Accounts use a one-time $9.99 account
          activation, not a monthly subscription. PPP does not inspect or certify workmanship.
        </p>
      </header>
      <EmptyState
        title="No visits scheduled"
        body="Verifier dispatch is not built yet. PPP does not inspect or certify workmanship."
      />
    </div>
  );
}

export function VerifierVisitsPage() {
  return <EmptyState title="No visits" body="Verifier dispatch is not built yet." />;
}

export function VerifierMessagesPage() {
  return <EmptyState title="No messages" body="Verifier messaging is not built yet." />;
}
