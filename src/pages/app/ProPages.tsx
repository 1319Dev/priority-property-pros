import { EmptyState } from "../../components/layout/DashboardShell";
import { displayName } from "../../lib/auth/roles";
import { useAuth } from "../../lib/auth/useAuth";

export function ProHomePage() {
  const { profile } = useAuth();
  const name = profile ? displayName(profile.first_name, profile.last_name, profile.email) : "Pro";
  return (
    <div className="space-y-6">
      <header>
        <p className="text-[0.72rem] font-semibold uppercase tracking-[0.22em] text-gold-600">Priority Pro</p>
        <h1 className="mt-2 font-display text-4xl font-semibold text-forest-800">{name}</h1>
        <p className="mt-3 max-w-xl text-ink-700">
          Contractor onboarding and job matching are not live. Your foundation profile exists so an admin can
          review you later. You cannot approve yourself.
        </p>
      </header>
      <EmptyState
        title="No jobs yet"
        body="Fair job responses ship in a later phase. PPP will not sell the same lead five times — and it is not selling any leads today."
      />
    </div>
  );
}

export function ProJobsPage() {
  return (
    <EmptyState title="Jobs are empty" body="Estimates, scheduling, and change orders are not in Phase 2." />
  );
}

export function ProMessagesPage() {
  return <EmptyState title="No messages" body="Contractor messaging is not built yet." />;
}
