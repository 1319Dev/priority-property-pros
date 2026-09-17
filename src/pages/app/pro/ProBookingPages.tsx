import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { EmptyState } from "../../../components/layout/DashboardShell";
import { Button } from "../../../components/ui/Button";
import { TextInput } from "../../../components/ui/Input";
import { FormError } from "../../../lib/auth/AuthCard";
import { useAuth } from "../../../lib/auth/useAuth";
import {
  completeBooking,
  expireStalePendingBookings,
  fetchBooking,
  fetchBookingContactAccess,
  fetchBookingJobContact,
  fetchChangeOrders,
  fetchContractorProfileByUser,
  fetchMyBookings,
  fetchProject,
  proposeChangeOrder,
  respondChangeOrder,
  startBooking,
} from "../../../lib/marketplace/api";
import { BOOKING_STATUS_LABELS, contactAccessRowAllowsReveal, paymentsComingSoonCopy, privateContactLockedCopy } from "../../../lib/marketplace/bookings";
import { dollarsToCents, formatUsdFromCents } from "../../../lib/marketplace/fees";
import type { Booking, BookingContactAccess, BookingStatus, ChangeOrder } from "../../../lib/marketplace/types";
import { useToast } from "../../../hooks/useToast";

function statusLabel(status: string) {
  return BOOKING_STATUS_LABELS[status as BookingStatus] ?? status.replaceAll("_", " ");
}

export type ProjectContactFields = {
  street?: string;
  phone?: string;
  email?: string;
};

export function ProjectContactSection({
  entitled,
  contact,
}: {
  entitled: boolean;
  contact: ProjectContactFields | null;
}) {
  return (
    <section className="rounded-3xl border border-forest-800/10 px-5 py-4 text-sm">
      <h2 className="font-display text-2xl text-forest-800">Project Contact</h2>
      {entitled && contact ? (
        <dl className="mt-3 space-y-2">
          <div>
            <dt className="text-[0.72rem] font-semibold uppercase tracking-[0.16em] text-gold-700">Street</dt>
            <dd className="mt-1 font-semibold text-forest-800">{contact.street || "Not provided"}</dd>
          </div>
          <div>
            <dt className="text-[0.72rem] font-semibold uppercase tracking-[0.16em] text-gold-700">Phone</dt>
            <dd className="mt-1 font-semibold text-forest-800">{contact.phone || "Not provided"}</dd>
          </div>
          <div>
            <dt className="text-[0.72rem] font-semibold uppercase tracking-[0.16em] text-gold-700">Email</dt>
            <dd className="mt-1 font-semibold text-forest-800">{contact.email || "Not provided"}</dd>
          </div>
        </dl>
      ) : (
        <p className="mt-3 leading-relaxed text-ink-700">{privateContactLockedCopy()}</p>
      )}
    </section>
  );
}

export function ProBookingsPage() {
  const { user } = useAuth();
  const [rows, setRows] = useState<Booking[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!user) return;
    void expireStalePendingBookings()
      .then(() => fetchContractorProfileByUser(user.id))
      .then((profile) => {
        if (!profile) throw new Error("Contractor profile missing.");
        return fetchMyBookings("contractor", profile.id);
      })
      .then((data) => setRows(data as Booking[]))
      .catch((err: Error) => setError(err.message));
  }, [user]);

  return (
    <div className="space-y-6">
      <h1 className="font-display text-4xl font-semibold text-forest-800">Bookings</h1>
      <p className="text-sm text-ink-700">
        Exact street, phone, and email stay hidden until hire and job-fee access. {paymentsComingSoonCopy()}
      </p>
      <FormError message={error} />
      {rows.length === 0 ? (
        <EmptyState title="No bookings" body="When a customer selects you, a pending booking appears here." />
      ) : (
        <ul className="space-y-3">
          {rows.map((row) => (
            <li key={row.id}>
              <Link to={`/app/pro/bookings/${row.id}`} className="block rounded-3xl border border-forest-800/10 px-5 py-4">
                <p className="font-semibold text-forest-800">{statusLabel(row.status)}</p>
                <p className="text-sm text-ink-500">
                  {formatUsdFromCents(row.billable_amount_cents || row.amount_cents)} · fee preview{" "}
                  {formatUsdFromCents(row.fee_cents)}
                </p>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export function ProBookingDetailPage() {
  const { bookingId = "" } = useParams();
  const toast = useToast();
  const [booking, setBooking] = useState<Booking | null>(null);
  const [title, setTitle] = useState("");
  const [cityZip, setCityZip] = useState("");
  const [contact, setContact] = useState<{ street?: string; phone?: string; email?: string } | null>(null);
  const [contactAccess, setContactAccess] = useState<BookingContactAccess | null>(null);
  const [orders, setOrders] = useState<ChangeOrder[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [delta, setDelta] = useState("");
  const [note, setNote] = useState("");

  async function reload() {
    const row = (await fetchBooking(bookingId)) as Booking;
    setBooking(row);
    const project = await fetchProject(row.project_id);
    setTitle(project.title);
    setCityZip([project.city, project.state, project.zip_code].filter(Boolean).join(", "));
    setOrders((await fetchChangeOrders(bookingId)) as ChangeOrder[]);
    const access = await fetchBookingContactAccess(row.id).catch(() => null);
    setContactAccess(access);
    if (contactAccessRowAllowsReveal(access)) {
      const payload = await fetchBookingJobContact(row.id);
      setContact({
        street: [payload.street_line1, payload.street_line2].filter(Boolean).join(", "),
        phone: String(payload.phone ?? ""),
        email: String(payload.email ?? ""),
      });
    } else {
      setContact(null);
    }
  }

  useEffect(() => {
    void reload().catch((err: Error) => setError(err.message));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bookingId]);

  if (!booking) return <p className="text-ink-500">{error ?? "Loading…"}</p>;
  const pending = booking.status === "PENDING" || booking.status === "AWAITING_PAYMENT";

  return (
    <div className="space-y-6">
      <h1 className="font-display text-4xl font-semibold text-forest-800">{title}</h1>
      <p className="text-sm text-ink-500">{statusLabel(booking.status)}</p>
      <FormError message={error} />
      {pending ? <p className="rounded-3xl bg-cream-100 px-5 py-4 text-sm font-semibold">{paymentsComingSoonCopy()}</p> : null}
      <section className="rounded-3xl border border-forest-800/10 px-5 py-4 text-sm">
        <p className="font-semibold">Approximate location</p>
        <p>{cityZip}</p>
        <p className="mt-3">Job {formatUsdFromCents(booking.billable_amount_cents || booking.amount_cents)}</p>
        <p>
          PPP fee {booking.fee_locked ? "" : "preview "}
          {formatUsdFromCents(booking.fee_cents)} — you would earn {formatUsdFromCents(booking.contractor_earnings_cents)}
        </p>
        <p className="text-ink-500">{paymentsComingSoonCopy()}</p>
      </section>
      <ProjectContactSection entitled={contactAccessRowAllowsReveal(contactAccess)} contact={contact} />
      {booking.status === "CONFIRMED" ? (
        <Button
          type="button"
          className="min-h-14 w-full"
          onClick={() => {
            void startBooking(booking.id)
              .then(() => {
                toast.push("Job started.");
                return reload();
              })
              .catch((err: Error) => setError(err.message));
          }}
        >
          Start job
        </Button>
      ) : null}
      {booking.status === "IN_PROGRESS" ? (
        <Button
          type="button"
          className="min-h-14 w-full"
          onClick={() => void completeBooking(booking.id).then(reload).catch((err: Error) => setError(err.message))}
        >
          Mark complete
        </Button>
      ) : null}

      {(booking.status === "CONFIRMED" || booking.status === "IN_PROGRESS") && (
        <section className="space-y-3">
          <h2 className="font-display text-2xl">Change orders</h2>
          <p className="text-sm text-ink-700">You cannot raise the price by yourself. The customer has to approve.</p>
          <ul className="space-y-2 text-sm">
            {orders.map((order) => (
              <li key={order.id} className="rounded-2xl bg-cream-100 px-4 py-3">
                <p className="font-semibold">
                  {formatUsdFromCents(order.amount_delta_cents)} · {order.status.replaceAll("_", " ")}
                </p>
                <p>{order.description}</p>
                {order.status === "CUSTOMER_APPROVED" && !order.contractor_acked_at ? (
                  <Button type="button" size="sm" className="mt-2" onClick={() => void respondChangeOrder(order.id, true).then(reload)}>
                    Acknowledge
                  </Button>
                ) : null}
              </li>
            ))}
          </ul>
          <TextInput label="Change amount (USD, + or −)" value={delta} onChange={(e) => setDelta(e.target.value)} />
          <textarea className="w-full rounded-2xl border px-4 py-3" value={note} onChange={(e) => setNote(e.target.value)} />
          <Button
            type="button"
            variant="outline"
            className="min-h-14 w-full"
            onClick={() => {
              const cents = dollarsToCents(delta.replace("-", "")) ?? 0;
              const signed = delta.trim().startsWith("-") ? -cents : cents;
              void proposeChangeOrder(booking.id, note, signed)
                .then(() => {
                  setDelta("");
                  setNote("");
                  return reload();
                })
                .catch((err: Error) => setError(err.message));
            }}
          >
            Propose a change
          </Button>
        </section>
      )}
    </div>
  );
}
