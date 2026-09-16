import { EmptyState } from "../../components/layout/DashboardShell";

export function AdminHomePage() {
  return (
    <div className="space-y-6">
      <header>
        <p className="text-[0.72rem] font-semibold uppercase tracking-[0.22em] text-gold-600">Admin</p>
        <h1 className="mt-2 font-display text-4xl font-semibold text-forest-800">Operations shell</h1>
        <p className="mt-3 max-w-xl text-ink-700">
          There is no public Admin registration. The first admin is promoted in the Supabase SQL editor. This
          screen does not elevate anyone.
        </p>
      </header>
      <EmptyState
        title="No queues yet"
        body="Approvals, user support tools, and audit browsing will grow here. Phase 2 only proves the role exists."
      />
    </div>
  );
}

export function AdminPeoplePage() {
  return (
    <EmptyState
      title="People list not wired"
      body="Admins will review profiles here later. Do not grant Admin from the website."
    />
  );
}

export function AdminApprovalsPage() {
  return (
    <EmptyState
      title="No approval queue"
      body="Contractor and verifier approval_status cannot be self-served. SQL or a later admin tool will set it."
    />
  );
}

export function AdminAuditPage() {
  return (
    <EmptyState
      title="Audit log viewer later"
      body="Rows exist in audit_logs. Clients cannot edit them. A read UI can wait until a live project is connected."
    />
  );
}
