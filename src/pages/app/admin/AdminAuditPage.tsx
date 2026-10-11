import { useState, type FormEvent } from "react";
import { EmptyState } from "../../../components/layout/DashboardShell";
import { Button } from "../../../components/ui/Button";
import { TextInput } from "../../../components/ui/Input";
import { FormError } from "../../../lib/auth/AuthCard";
import { friendlyAdminError } from "../../../lib/admin/friendlyAdminError";
import { listAdminAuditLog, type AuditLogFilters, type AuditLogRow } from "../../../lib/admin/auditApi";
import { isSupabaseConfigured } from "../../../lib/supabase/config";

const ROLE_LABEL: Record<string, string> = {
  ADMIN: "Admin",
  CUSTOMER: "Customer",
  CONTRACTOR: "Contractor",
  VERIFIER: "Verifier",
  SYSTEM: "System",
};

function formatWhen(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return `${date.toISOString().replace("T", " ").slice(0, 16)} UTC`;
}

export function AdminAuditPage() {
  const [rows, setRows] = useState<AuditLogRow[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [offline, setOffline] = useState(!isSupabaseConfigured());
  const [loaded, setLoaded] = useState(false);
  const [busy, setBusy] = useState(false);
  const [actor, setActor] = useState("");
  const [action, setAction] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [reference, setReference] = useState("");

  async function load(filters: AuditLogFilters) {
    setBusy(true);
    setError(null);
    try {
      const next = await listAdminAuditLog(filters);
      setRows(next);
      setLoaded(true);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "";
      if (!isSupabaseConfigured() || /not configured/i.test(message)) {
        setOffline(true);
        return;
      }
      setError(friendlyAdminError(err instanceof Error ? { message } : null, "Could not load the audit log."));
      setLoaded(true);
    } finally {
      setBusy(false);
    }
  }

  function onSubmit(event: FormEvent) {
    event.preventDefault();
    void load({ actor, action, from, to, reference });
  }

  if (offline) {
    return <EmptyState title="Marketplace not connected" body="The audit log needs Supabase." />;
  }

  return (
    <div className="space-y-6">
      <header>
        <p className="text-xs font-semibold uppercase tracking-[0.22em] text-gold-700">Admin</p>
        <h1 className="mt-2 font-display text-4xl font-semibold text-forest-800">Audit log</h1>
        <p className="mt-3 max-w-xl text-sm leading-relaxed text-ink-700">
          Read-only. Rows show a role, an action, a time, and a job number. Names, contact details, addresses, and
          photo paths stay out of this list.
        </p>
      </header>

      <form className="grid gap-4 sm:grid-cols-2" onSubmit={onSubmit}>
        <label className="block">
          <span className="mb-1.5 block text-xs font-semibold uppercase tracking-[0.16em] text-gold-700">Actor</span>
          <select
            name="actor"
            className="min-h-14 w-full rounded-2xl border border-forest-800/15 bg-cream-50 px-4 text-base text-ink-900"
            value={actor}
            onChange={(event) => setActor(event.target.value)}
          >
            <option value="">Any role</option>
            <option value="ADMIN">Admin</option>
            <option value="CUSTOMER">Customer</option>
            <option value="CONTRACTOR">Contractor</option>
            <option value="SYSTEM">System</option>
          </select>
        </label>
        <TextInput label="Action" name="action" value={action} onChange={(event) => setAction(event.target.value)} />
        <TextInput label="From" name="from" type="date" value={from} onChange={(event) => setFrom(event.target.value)} />
        <TextInput label="To" name="to" type="date" value={to} onChange={(event) => setTo(event.target.value)} />
        <TextInput
          label="PPP number"
          name="reference"
          value={reference}
          onChange={(event) => setReference(event.target.value)}
          hint="PPP-1042 or 1042"
        />
        <div className="flex items-end">
          <Button type="submit" className="min-h-14 w-full" disabled={busy}>
            {busy ? "Loading…" : loaded ? "Update" : "Show events"}
          </Button>
        </div>
      </form>

      <FormError message={error} />

      {!loaded ? null : rows.length === 0 ? (
        <EmptyState title="No matching events" body="Try another role, action, date, or PPP number." />
      ) : (
        <ul className="space-y-3">
          {rows.map((row) => (
            <li key={`${row.occurredAt}-${row.action}-${row.jobReference ?? ""}`} className="rounded-3xl border border-forest-800/10 bg-cream-50 px-5 py-4">
              <p className="text-xs font-semibold uppercase tracking-[0.16em] text-gold-700">
                {ROLE_LABEL[row.actorRole] ?? "System"}
                {row.jobReference ? ` · ${row.jobReference}` : ""}
              </p>
              <p className="mt-1 font-semibold text-forest-800">{row.action}</p>
              <p className="mt-1 text-sm text-ink-500">{formatWhen(row.occurredAt)}</p>
              {row.summary ? <p className="mt-2 text-sm text-ink-700">{row.summary}</p> : null}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
