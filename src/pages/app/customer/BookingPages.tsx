import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { EmptyState } from "../../../components/layout/DashboardShell";
import { Button, ButtonLink } from "../../../components/ui/Button";
import { TextInput } from "../../../components/ui/Input";
import { FormError } from "../../../lib/auth/AuthCard";
import { useAuth } from "../../../lib/auth/useAuth";
import {
  cancelPendingBooking,
  completeBooking,
  disputeBooking,
  expireStalePendingBookings,
  fetchBooking,
  fetchBookingReviews,
  fetchChangeOrders,
  fetchHireAgainContractors,
  fetchMyBookings,
  fetchProject,
  fetchProtectionMonths,
  fetchPublicContractor,
  proposeChangeOrder,
  respondChangeOrder,
  submitBookingReview,
  type RpcJson,
} from "../../../lib/marketplace/api";
import { BOOKING_STATUS_LABELS, paymentsComingSoonCopy } from "../../../lib/marketplace/bookings";
import { dollarsToCents, formatUsdFromCents } from "../../../lib/marketplace/fees";
import type { Booking, BookingStatus, ChangeOrder } from "../../../lib/marketplace/types";
import { useToast } from "../../../hooks/useToast";

function statusLabel(status: string) {
  return BOOKING_STATUS_LABELS[status as BookingStatus] ?? status.replaceAll("_", " ");
}

export function CustomerBookingsPage() {
  const { profile } = useAuth();
  const [rows, setRows] = useState<Booking[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!profile) return;
    void expireStalePendingBookings()
      .then(() => fetchMyBookings("customer", profile.id))
      .then((data) => setRows(data as Booking[]))
      .catch((err: Error) => setError(err.message));
  }, [profile]);

  return (
    <div className="space-y-6">
      <h1 className="font-display text-4xl font-semibold text-forest-800">Bookings</h1>
      <p className="text-ink-700">Selecting a pro starts a booking. {paymentsComingSoonCopy()}</p>
      <FormError message={error} />
      {rows.length === 0 ? (
        <EmptyState title="No bookings yet" body="When you select a contractor, the booking will wait here. Nothing is marked paid." />
      ) : (
        <ul className="space-y-3">
          {rows.map((row) => (
            <li key={row.id}>
              <Link to={`/app/customer/bookings/${row.id}`} className="block rounded-3xl border border-forest-800/10 bg-cream-50 px-5 py-4">
                <p className="font-semibold text-forest-800">{statusLabel(row.status)}</p>
                <p className="mt-1 text-sm text-ink-500">
                  Job {formatUsdFromCents(row.billable_amount_cents || row.amount_cents)} · PPP fee preview{" "}
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

export function CustomerBookingDetailPage() {
  const { bookingId = "" } = useParams();
  const toast = useToast();
  const [booking, setBooking] = useState<Booking | null>(null);
  const [title, setTitle] = useState("");
  const [contractor, setContractor] = useState<string>("");
  const [orders, setOrders] = useState<ChangeOrder[]>([]);
  const [reviews, setReviews] = useState<Awaited<ReturnType<typeof fetchBookingReviews>>>([]);
  const [error, setError] = useState<string | null>(null);
  const [delta, setDelta] = useState("");
  const [note, setNote] = useState("");
  const [rating, setRating] = useState("5");
  const [body, setBody] = useState("");
  const [busy, setBusy] = useState(false);

  async function reload() {
    const row = (await fetchBooking(bookingId)) as Booking;
    setBooking(row);
    const project = await fetchProject(row.project_id).catch(() => null);
    setTitle(project?.title ?? "Booking");
    const pro = await fetchPublicContractor(row.contractor_profile_id).catch(() => null);
    setContractor(pro?.display_label ?? "Local pro");
    setOrders((await fetchChangeOrders(bookingId)) as ChangeOrder[]);
    setReviews(await fetchBookingReviews(bookingId));
  }

  useEffect(() => {
    void reload().catch((err: Error) => setError(err.message));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bookingId]);

  if (!booking) return <p className="text-ink-500">{error ?? "Loading…"}</p>;

  const pending = booking.status === "PENDING" || booking.status === "AWAITING_PAYMENT";

  return (
    <div className="space-y-6">
      <header>
        <p className="text-[0.72rem] font-semibold uppercase tracking-[0.22em] text-gold-600">{statusLabel(booking.status)}</p>
        <h1 className="mt-2 font-display text-4xl font-semibold text-forest-800">{title}</h1>
        <p className="mt-2 text-ink-700">{contractor}</p>
      </header>
      <FormError message={error} />
      {pending ? (
        <p className="rounded-3xl bg-cream-100 px-5 py-4 text-sm font-semibold text-forest-800">{paymentsComingSoonCopy()}</p>
      ) : null}
      <section className="rounded-3xl border border-forest-800/10 bg-cream-50 px-5 py-4 text-sm">
        <p>Job total {formatUsdFromCents(booking.billable_amount_cents || booking.amount_cents)}</p>
        <p>
          PPP fee {booking.fee_locked ? "" : "preview "}
          {formatUsdFromCents(booking.fee_cents)} ({booking.fee_kind === "REPEAT" ? "Hire Again rate" : "original schedule"})
        </p>
        <p>Pro would earn {formatUsdFromCents(booking.contractor_earnings_cents)}</p>
        <p className="mt-2 text-ink-500">{paymentsComingSoonCopy()} You are not charged a customer percentage.</p>
      </section>
      {pending ? (
        <Button
          type="button"
          variant="outline"
          className="min-h-14 w-full"
          disabled={busy}
          onClick={() => {
            setBusy(true);
            void cancelPendingBooking(booking.id)
              .then(() => {
                toast.push("Booking cancelled. The exact address was never shared.");
                return reload();
              })
              .catch((err: Error) => setError(err.message))
              .finally(() => setBusy(false));
          }}
        >
          Cancel this booking
        </Button>
      ) : null}
      {booking.status === "IN_PROGRESS" ? (
        <Button
          type="button"
          className="min-h-14 w-full"
          disabled={busy}
          onClick={() => {
            setBusy(true);
            void completeBooking(booking.id)
              .then(() => reload())
              .catch((err: Error) => setError(err.message))
              .finally(() => setBusy(false));
          }}
        >
          Mark complete
        </Button>
      ) : null}
      {booking.status === "CONFIRMED" || booking.status === "IN_PROGRESS" || booking.status === "COMPLETED" ? (
        <Button
          type="button"
          variant="ghost"
          className="min-h-12 w-full"
          onClick={() => {
            void disputeBooking(booking.id).then(() => reload()).catch((err: Error) => setError(err.message));
          }}
        >
          Open a dispute
        </Button>
      ) : null}

      {(booking.status === "CONFIRMED" || booking.status === "IN_PROGRESS") && (
        <section className="space-y-3">
          <h2 className="font-display text-2xl text-forest-800">Change orders</h2>
          <p className="text-sm text-ink-700">The pro cannot raise the price alone. You both have to agree.</p>
          <ul className="space-y-2 text-sm">
            {orders.map((order) => (
              <li key={order.id} className="rounded-2xl border border-forest-800/10 px-4 py-3">
                <p className="font-semibold">
                  {formatUsdFromCents(order.amount_delta_cents)} · {order.status.replaceAll("_", " ")}
                </p>
                <p>{order.description}</p>
                {order.status === "PROPOSED" ? (
                  <div className="mt-2 flex gap-2">
                    <Button type="button" size="sm" onClick={() => void respondChangeOrder(order.id, true).then(reload)}>
                      Approve
                    </Button>
                    <Button type="button" size="sm" variant="outline" onClick={() => void respondChangeOrder(order.id, false).then(reload)}>
                      Decline
                    </Button>
                  </div>
                ) : null}
              </li>
            ))}
          </ul>
          <TextInput label="Change amount (USD, + or −)" value={delta} onChange={(e) => setDelta(e.target.value)} />
          <label className="block">
            <span className="mb-1.5 block text-[0.72rem] font-semibold uppercase tracking-[0.16em] text-gold-700">What changed</span>
            <textarea className="w-full rounded-2xl border border-forest-800/15 px-4 py-3" value={note} onChange={(e) => setNote(e.target.value)} />
          </label>
          <Button
            type="button"
            variant="outline"
            className="min-h-14 w-full"
            onClick={() => {
              const cents = dollarsToCents(delta.replace("-", "")) ?? 0;
              const signed = delta.trim().startsWith("-") ? -cents : cents;
              void proposeChangeOrder(booking.id, note, signed).then(() => {
                setDelta("");
                setNote("");
                return reload();
              }).catch((err: Error) => setError(err.message));
            }}
          >
            Propose a change
          </Button>
        </section>
      )}

      {booking.status === "COMPLETED" && !reviews.some((row) => row.reviewer_role === "CUSTOMER") ? (
        <section className="space-y-3">
          <h2 className="font-display text-2xl text-forest-800">Leave a review</h2>
          <p className="text-sm text-ink-700">
            1–5 stars after a completed job. Written comments are optional. You can only review this hired pro once.
          </p>
          <TextInput label="Rating (1–5)" inputMode="numeric" value={rating} onChange={(e) => setRating(e.target.value)} />
          <textarea className="w-full rounded-2xl border px-4 py-3" value={body} onChange={(e) => setBody(e.target.value)} />
          <Button
            type="button"
            className="min-h-14 w-full"
            onClick={() => {
              void submitBookingReview(booking.id, Number(rating), body)
                .then(() => reload())
                .catch((err: Error) => setError(err.message));
            }}
          >
            Submit review
          </Button>
        </section>
      ) : null}
      {reviews.length > 0 ? (
        <ul className="space-y-2">
          {reviews.map((row) => (
            <li key={row.id} className="rounded-3xl bg-cream-100 px-5 py-4 text-sm">
              {row.reviewer_role === "CUSTOMER" ? "Your review" : "Pro review"} · {row.rating} / 5
              {row.body ? <p className="mt-2">{row.body}</p> : null}
            </li>
          ))}
        </ul>
      ) : null}
      <ButtonLink to={`/app/customer/projects/${booking.project_id}`} variant="ghost">
        Back to project
      </ButtonLink>
    </div>
  );
}

export function HireAgainPage() {
  const [rows, setRows] = useState<RpcJson[]>([]);
  const [months, setMonths] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void Promise.all([fetchHireAgainContractors(), fetchProtectionMonths()])
      .then(([pros, protection]) => {
        setRows(pros);
        setMonths(protection);
      })
      .catch((err: Error) => setError(err.message));
  }, []);

  return (
    <div className="space-y-6">
      <h1 className="font-display text-4xl font-semibold text-forest-800">Hire again</h1>
      <p className="text-ink-700">
        Pros you already finished a job with. Repeat pricing is applied automatically. You cannot pick original vs repeat
        yourself. The introduction window is {months ?? "—"} months.
      </p>
      <FormError message={error} />
      {rows.length === 0 ? (
        <EmptyState
          title="No Hire Again pros yet"
          body="After a confirmed booking is completed, that contractor will show up here with repeat pricing."
        />
      ) : (
        <ul className="space-y-3">
          {rows.map((row) => (
            <li key={String(row.relationship_id)} className="rounded-3xl border border-forest-800/10 px-5 py-4">
              <p className="font-semibold text-forest-800">{String(row.business_name)}</p>
                  <p className="text-sm text-ink-500">Repeat pricing · {paymentsComingSoonCopy()}</p>
              <ButtonLink to="/app/customer/projects/new/wizard" className="mt-3 min-h-14 w-full">
                Post a new project
              </ButtonLink>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
