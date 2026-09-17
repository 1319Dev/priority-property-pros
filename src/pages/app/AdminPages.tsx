import { useEffect, useState } from "react";
import { EmptyState } from "../../components/layout/DashboardShell";
import { Button } from "../../components/ui/Button";
import { ConfirmDialog } from "../../components/ui/ConfirmDialog";
import { FormError } from "../../lib/auth/AuthCard";
import {
  adminGrantBookingContactAccess,
  adminRevokeBookingContactAccess,
  confirmBookingForTesting,
  expireStalePendingBookings,
  fetchBooking,
  fetchBookingContactAccess,
  fetchBookingEvents,
} from "../../lib/marketplace/api";
import {
  contactAccessRowAllowsReveal,
  formatContactAccessState,
  formatTimestamp,
  paymentsComingSoonCopy,
  privateContactLockedCopy,
} from "../../lib/marketplace/bookings";
import type { BookingContactAccess } from "../../lib/marketplace/types";
import { useToast } from "../../hooks/useToast";

export function AdminHomePage() {
  return (
    <div className="space-y-6">
      <header>
        <p className="text-[0.72rem] font-semibold uppercase tracking-[0.22em] text-gold-600">Admin</p>
        <h1 className="mt-2 font-display text-4xl font-semibold text-forest-800">Operations shell</h1>
        <p className="mt-3 max-w-xl text-ink-700">
          There is no public Admin registration. The first admin is promoted in the Supabase SQL editor. This
          screen does not elevate anyone. Payments are not live.
        </p>
      </header>
      <EmptyState
        title="Queues stay small on purpose"
        body="Use Bookings for the test-only confirmation path. Do not tell customers a card was charged."
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

export { AdminApprovalDetailPage, AdminApprovalsPage } from "./admin/AdminApprovalsPages";

export function AdminAuditPage() {
  return (
    <EmptyState
      title="Audit log viewer later"
      body="Rows exist in audit_logs. Clients cannot edit them. A read UI can wait until a live project is connected."
    />
  );
}

export type ContactAccessAuditEvent = {
  id: string;
  event_type: string;
  payload: Record<string, unknown> | null;
  created_at: string;
};

export function AdminContactAccessPanel({
  access,
  audit,
}: {
  access: BookingContactAccess | null;
  audit: ContactAccessAuditEvent[];
}) {
  const state = formatContactAccessState(access);
  const grantedAt = formatTimestamp(access?.granted_at);
  const revokedAt = formatTimestamp(access?.revoked_at);
  return (
    <div className="space-y-3 text-sm">
      <p>
        <span className="text-[0.72rem] font-semibold uppercase tracking-[0.16em] text-gold-700">Contact Access</span>
        <span className="mt-1 block font-semibold text-forest-800">{state}</span>
      </p>
      {access?.granted_by ? (
        <p>
          Granted by <span className="font-mono text-xs">{access.granted_by}</span>
          {grantedAt ? ` at ${grantedAt}` : ""}
        </p>
      ) : null}
      {access?.grant_reason ? <p>Reason: {access.grant_reason}</p> : null}
      {access?.grant_source ? <p>Source: {access.grant_source}</p> : null}
      {revokedAt ? <p>Revoked at {revokedAt}</p> : null}
      {audit.length > 0 ? (
        <div>
          <p className="text-[0.72rem] font-semibold uppercase tracking-[0.16em] text-gold-700">Audit</p>
          <ul className="mt-2 space-y-2">
            {audit.map((row) => (
              <li key={row.id} className="rounded-2xl bg-cream-100 px-4 py-3">
                <p className="font-semibold text-forest-800">{row.event_type.replaceAll("_", " ")}</p>
                <p className="text-ink-500">{formatTimestamp(row.created_at)}</p>
                {typeof row.payload?.reason === "string" ? <p>Reason: {row.payload.reason}</p> : null}
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
}

export function AdminBookingsPage() {
  const toast = useToast();
  const [bookingId, setBookingId] = useState("");
  const [status, setStatus] = useState<string | null>(null);
  const [access, setAccess] = useState<BookingContactAccess | null>(null);
  const [audit, setAudit] = useState<ContactAccessAuditEvent[]>([]);
  const [reason, setReason] = useState("");
  const [confirmGrant, setConfirmGrant] = useState(false);
  const [confirmRevoke, setConfirmRevoke] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const lookedUp = status !== null;

  useEffect(() => {
    void expireStalePendingBookings().catch(() => undefined);
  }, []);

  async function loadBooking(id: string) {
    const row = await fetchBooking(id);
    setStatus(row.status);
    const rowAccess = await fetchBookingContactAccess(id).catch(() => null);
    setAccess(rowAccess);
    const events = await fetchBookingEvents(id).catch(() => []);
    setAudit(
      events
        .filter((event) => String(event.event_type).startsWith("contact_access."))
        .map((event) => ({
          id: String(event.id),
          event_type: String(event.event_type),
          payload:
            event.payload && typeof event.payload === "object" && !Array.isArray(event.payload)
              ? (event.payload as Record<string, unknown>)
              : null,
          created_at: String(event.created_at),
        })),
    );
    return row;
  }

  return (
    <div className="space-y-6">
      <h1 className="font-display text-4xl font-semibold text-forest-800">Test booking confirm</h1>
      <p className="rounded-3xl bg-cream-100 px-5 py-4 text-sm font-semibold text-forest-800">
        TEST ONLY. This is not “Pay now succeeded.” {paymentsComingSoonCopy()} Customers and contractors cannot call this.
        Confirming a booking does not unlock private contact.
      </p>
      <FormError message={error} />
      <label className="block">
        <span className="mb-1.5 block text-[0.72rem] font-semibold uppercase tracking-[0.16em] text-gold-700">
          Booking id
        </span>
        <input
          className="min-h-14 w-full rounded-2xl border border-forest-800/15 px-4"
          value={bookingId}
          onChange={(e) => setBookingId(e.target.value)}
        />
      </label>
      <Button
        type="button"
        variant="outline"
        disabled={busy || !bookingId.trim()}
        onClick={() => {
          setBusy(true);
          setError(null);
          void loadBooking(bookingId.trim())
            .catch((err: Error) => setError(err.message))
            .finally(() => setBusy(false));
        }}
      >
        Look up
      </Button>
      {status ? <p className="text-sm">Current status: {status.replaceAll("_", " ")}</p> : null}
      {lookedUp ? <AdminContactAccessPanel access={access} audit={audit} /> : null}
      <Button
        type="button"
        className="min-h-14 w-full"
        disabled={busy || !bookingId.trim()}
        onClick={() => {
          setBusy(true);
          setError(null);
          void confirmBookingForTesting(bookingId.trim())
            .then(async (result) => {
              toast.push("Testing confirmation recorded. No charge was made. Private contact stays locked.");
              setStatus(String(result.status ?? "CONFIRMED"));
              await loadBooking(bookingId.trim());
            })
            .catch((err: Error) => setError(err.message))
            .finally(() => setBusy(false));
        }}
      >
        Confirm for testing (no charge)
      </Button>

      <section className="space-y-3 rounded-3xl border border-forest-800/10 px-5 py-4">
        <h2 className="font-display text-2xl text-forest-800">Grant contact access</h2>
        <p className="text-sm text-ink-700">{privateContactLockedCopy()} This override is for one booking only and is audited.</p>
        <label className="block">
          <span className="mb-1.5 block text-[0.72rem] font-semibold uppercase tracking-[0.16em] text-gold-700">
            Reason (required)
          </span>
          <textarea
            className="min-h-24 w-full rounded-2xl border border-forest-800/15 px-4 py-3"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="Why this customer↔contractor pair should see private contact"
          />
        </label>
        <Button
          type="button"
          variant="outline"
          className="min-h-14 w-full"
          disabled={busy || !bookingId.trim() || reason.trim().length < 3}
          onClick={() => setConfirmGrant(true)}
        >
          Grant contact access
        </Button>
        {contactAccessRowAllowsReveal(access) ? (
          <Button
            type="button"
            variant="ghost"
            className="min-h-12 w-full"
            disabled={busy || !bookingId.trim() || reason.trim().length < 3}
            onClick={() => setConfirmRevoke(true)}
          >
            Revoke contact access
          </Button>
        ) : null}
      </section>

      <ConfirmDialog
        open={confirmGrant}
        title="Grant private contact access?"
        body="This unlocks exact street, phone, and email for this booking’s customer and hired contractor only. It is audited with your admin id, time, and reason. It is not a global privacy bypass."
        confirmLabel="Grant access"
        cancelLabel="Cancel"
        tone="primary"
        busy={busy}
        onClose={() => setConfirmGrant(false)}
        onConfirm={() => {
          setBusy(true);
          setError(null);
          void adminGrantBookingContactAccess(bookingId.trim(), reason.trim())
            .then(async () => {
              toast.push("Contact access granted for this booking. Audit log written.");
              setConfirmGrant(false);
              await loadBooking(bookingId.trim());
            })
            .catch((err: Error) => setError(err.message))
            .finally(() => setBusy(false));
        }}
      />
      <ConfirmDialog
        open={confirmRevoke}
        title="Revoke private contact access?"
        body="The hired contractor loses street, phone, and email immediately. This is audited with your admin id, time, and reason."
        confirmLabel="Revoke access"
        cancelLabel="Cancel"
        tone="danger"
        busy={busy}
        onClose={() => setConfirmRevoke(false)}
        onConfirm={() => {
          setBusy(true);
          setError(null);
          void adminRevokeBookingContactAccess(bookingId.trim(), reason.trim())
            .then(async () => {
              toast.push("Contact access revoked for this booking. Audit log written.");
              setConfirmRevoke(false);
              await loadBooking(bookingId.trim());
            })
            .catch((err: Error) => setError(err.message))
            .finally(() => setBusy(false));
        }}
      />
    </div>
  );
}
