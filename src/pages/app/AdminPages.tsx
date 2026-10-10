import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { Button } from "../../components/ui/Button";
import { ConfirmDialog } from "../../components/ui/ConfirmDialog";
import { FormError } from "../../lib/auth/AuthCard";
import { JobReference } from "../../components/marketplace/JobReference";
import {
  adminGrantBookingContactAccess,
  adminRevokeBookingContactAccess,
  confirmBookingForTesting,
  expireStalePendingBookings,
  fetchBooking,
  fetchBookingContactAccess,
  fetchBookingEvents,
  fetchProject,
  findAdminBookingsByReference,
  type AdminReferenceBooking,
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
import { showTestingConfirmButton } from "../../lib/admin/testingConfirm";

export function AdminHomePage() {
  return (
    <div className="space-y-6">
      <header>
        <p className="text-xs font-semibold uppercase tracking-[0.22em] text-gold-600">Admin</p>
        <h1 className="mt-2 font-display text-4xl font-semibold text-forest-800">Overview</h1>
        <p className="mt-3 max-w-xl text-ink-700">
          There is no public Admin registration. The first admin is promoted in the Supabase SQL editor. This
          screen does not elevate anyone.
        </p>
      </header>
    </div>
  );
}

export { AdminApprovalDetailPage, AdminApprovalsPage } from "./admin/AdminApprovalsPages";
export { AdminReviewsPage } from "./admin/AdminReviewsPage";

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
        <span className="text-xs font-semibold uppercase tracking-[0.16em] text-gold-700">Contact Access</span>
        <span className="mt-1 block font-semibold text-forest-800">{state}</span>
      </p>
      {access?.granted_by ? (
        <p>
          Granted by <span className="break-all font-mono text-xs">{access.granted_by}</span>
          {grantedAt ? ` at ${grantedAt}` : ""}
        </p>
      ) : null}
      {access?.grant_reason ? <p>Reason: {access.grant_reason}</p> : null}
      {access?.grant_source ? <p>Source: {access.grant_source}</p> : null}
      {revokedAt ? <p>Revoked at {revokedAt}</p> : null}
      {audit.length > 0 ? (
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-gold-700">Audit</p>
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
  const [searchParams] = useSearchParams();
  const refParam = searchParams.get("ref");
  const [bookingId, setBookingId] = useState("");
  const [referenceQuery, setReferenceQuery] = useState("");
  const [referenceTitle, setReferenceTitle] = useState<string | null>(null);
  const [referenceNumber, setReferenceNumber] = useState<number | null>(null);
  const [referenceBookings, setReferenceBookings] = useState<AdminReferenceBooking[]>([]);
  const [jobReference, setJobReference] = useState<number | null>(null);
  const [jobTitle, setJobTitle] = useState<string | null>(null);
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

  useEffect(() => {
    const ref = refParam?.trim();
    if (!ref) return;
    let cancel = false;
    setReferenceQuery(ref);
    setBusy(true);
    setError(null);
    void findAdminBookingsByReference(ref)
      .then((found) => {
        if (cancel) return;
        if (!found) {
          setReferenceTitle(null);
          setReferenceNumber(null);
          setReferenceBookings([]);
          setError("No job uses that reference.");
          return;
        }
        setReferenceTitle(found.title);
        setReferenceNumber(found.referenceNumber);
        setReferenceBookings(found.bookings);
      })
      .catch((err: Error) => {
        if (!cancel) setError(err.message);
      })
      .finally(() => {
        if (!cancel) setBusy(false);
      });
    return () => {
      cancel = true;
    };
  }, [refParam]);

  async function loadBooking(id: string) {
    const row = await fetchBooking(id);
    setStatus(row.status);
    const project = await fetchProject(row.project_id).catch(() => null);
    setJobTitle(project?.title ?? null);
    setJobReference(project?.reference_number ?? null);
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
      <h1 className="font-display text-4xl font-semibold text-forest-800">Booking tools</h1>
      {showTestingConfirmButton() ? (
        <p className="rounded-3xl bg-cream-100 px-5 py-4 text-sm font-semibold text-forest-800">
          TEST ONLY. This is not “Pay now succeeded.” {paymentsComingSoonCopy()} Customers and contractors cannot call
          this. Confirming a booking does not unlock private contact.
        </p>
      ) : (
        <p className="max-w-xl text-sm text-ink-700">
          Look up a job, then grant or revoke contact access for that one booking. The grant is audited.
        </p>
      )}
      <FormError message={error} />
      <section className="space-y-3 rounded-3xl border border-forest-800/10 px-5 py-4">
        <h2 className="font-display text-2xl text-forest-800">Find a job</h2>
        <label className="block">
          <span className="mb-1.5 block text-xs font-semibold uppercase tracking-[0.16em] text-gold-700">
            Job reference
          </span>
          <input
            className="min-h-14 w-full rounded-2xl border border-forest-800/15 px-4"
            value={referenceQuery}
            placeholder="PPP-1042"
            onChange={(e) => setReferenceQuery(e.target.value)}
          />
        </label>
        <Button
          type="button"
          variant="outline"
          disabled={busy || !referenceQuery.trim()}
          onClick={() => {
            setBusy(true);
            setError(null);
            void findAdminBookingsByReference(referenceQuery)
              .then((found) => {
                if (!found) {
                  setReferenceTitle(null);
                  setReferenceNumber(null);
                  setReferenceBookings([]);
                  setError("No job uses that reference.");
                  return;
                }
                setReferenceTitle(found.title);
                setReferenceNumber(found.referenceNumber);
                setReferenceBookings(found.bookings);
              })
              .catch((err: Error) => setError(err.message))
              .finally(() => setBusy(false));
          }}
        >
          Search reference
        </Button>
        {referenceNumber != null ? (
          <div>
            <p className="font-semibold text-forest-800">{referenceTitle}</p>
            <JobReference value={referenceNumber} />
            {referenceBookings.length === 0 ? (
              <p className="mt-2 text-sm text-ink-500">This job has no booking yet.</p>
            ) : (
              <ul className="mt-2 space-y-2">
                {referenceBookings.map((row) => (
                  <li key={row.id}>
                    <button
                      type="button"
                      className="min-h-11 text-left text-sm font-semibold text-forest-800 underline"
                      onClick={() => {
                        setBookingId(row.id);
                        setBusy(true);
                        setError(null);
                        void loadBooking(row.id)
                          .catch((err: Error) => setError(err.message))
                          .finally(() => setBusy(false));
                      }}
                    >
                      Open booking · {row.status.replaceAll("_", " ")}
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        ) : null}
      </section>
      <label className="block">
        <span className="mb-1.5 block text-xs font-semibold uppercase tracking-[0.16em] text-gold-700">
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
      {status ? (
        <div className="text-sm">
          {jobTitle ? <p className="font-semibold text-forest-800">{jobTitle}</p> : null}
          <JobReference value={jobReference} />
          <p>Current status: {status.replaceAll("_", " ")}</p>
        </div>
      ) : null}
      {lookedUp ? <AdminContactAccessPanel access={access} audit={audit} /> : null}
      {showTestingConfirmButton() ? (
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
      ) : null}

      <section className="space-y-3 rounded-3xl border border-forest-800/10 px-5 py-4">
        <h2 className="font-display text-2xl text-forest-800">Grant contact access</h2>
        <p className="text-sm text-ink-700">{privateContactLockedCopy()} This override is for one booking only and is audited.</p>
        <label className="block">
          <span className="mb-1.5 block text-xs font-semibold uppercase tracking-[0.16em] text-gold-700">
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
