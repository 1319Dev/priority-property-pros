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
          Priority Verified is not live. This dashboard is a shell so independent verifiers can hold an account
          without implying inspections happen today. Accounts use a one-time $9.99 signup fee, not a monthly
          subscription.
        </p>
      </header>
      <EmptyState
        title="No visits scheduled"
        body="Completion verification workflow is a later phase. Do not advertise verification as a code inspection."
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
