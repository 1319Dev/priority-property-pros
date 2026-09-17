import { useEffect, useState } from "react";
import { EmptyState } from "../../components/layout/DashboardShell";
import { Button } from "../../components/ui/Button";
import { FormError } from "../../lib/auth/AuthCard";
import { confirmBookingForTesting, expireStalePendingBookings, fetchBooking } from "../../lib/marketplace/api";
import { paymentsComingSoonCopy } from "../../lib/marketplace/bookings";
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

export function AdminBookingsPage() {
  const toast = useToast();
  const [bookingId, setBookingId] = useState("");
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    void expireStalePendingBookings().catch(() => undefined);
  }, []);

  return (
    <div className="space-y-6">
      <h1 className="font-display text-4xl font-semibold text-forest-800">Test booking confirm</h1>
      <p className="rounded-3xl bg-cream-100 px-5 py-4 text-sm font-semibold text-forest-800">
        TEST ONLY. This is not “Pay now succeeded.” {paymentsComingSoonCopy()} Customers and contractors cannot call this.
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
          void fetchBooking(bookingId.trim())
            .then((row) => setStatus(row.status))
            .catch((err: Error) => setError(err.message))
            .finally(() => setBusy(false));
        }}
      >
        Look up
      </Button>
      {status ? <p className="text-sm">Current status: {status.replaceAll("_", " ")}</p> : null}
      <Button
        type="button"
        className="min-h-14 w-full"
        disabled={busy || !bookingId.trim()}
        onClick={() => {
          setBusy(true);
          setError(null);
          void confirmBookingForTesting(bookingId.trim())
            .then((result) => {
              toast.push("Testing confirmation recorded. No charge was made.");
              setStatus(String(result.status ?? "CONFIRMED"));
            })
            .catch((err: Error) => setError(err.message))
            .finally(() => setBusy(false));
        }}
      >
        Confirm for testing (no charge)
      </Button>
    </div>
  );
}
