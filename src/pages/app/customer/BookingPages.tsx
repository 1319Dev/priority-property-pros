import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { EmptyState } from "../../../components/layout/DashboardShell";
import { Button, ButtonLink } from "../../../components/ui/Button";
import { ConfirmDialog } from "../../../components/ui/ConfirmDialog";
import { TextInput } from "../../../components/ui/Input";
import { FormError } from "../../../lib/auth/AuthCard";
import { useAuth } from "../../../lib/auth/useAuth";
import {
  cancelPendingBooking,
  completeBooking,
  confirmBookingHired,
  disputeBooking,
  expireStalePendingBookings,
  fetchBooking,
  fetchBookingReviews,
  fetchChangeOrders,
  fetchCustomerProjects,
  fetchHireAgainContractors,
  fetchMyBookings,
  fetchProject,
  fetchPublicContractor,
  proposeChangeOrder,
  respondChangeOrder,
  startBooking,
  submitBookingReview,
  type RpcJson,
} from "../../../lib/marketplace/api";
import { BOOKING_STATUS_LABELS, canCustomerCancelPendingBooking, canStartBooking } from "../../../lib/marketplace/bookings";
import { CUSTOMER_PAYS_DIRECTLY, HIRE_AGAIN_EMPTY, HIRE_AGAIN_INTRO, customerWizardPath } from "../../../lib/marketplace/customerCopy";
import { dollarsToCents, formatUsdFromCents } from "../../../lib/marketplace/fees";
import { isMutuallyHired, bookingListHiredLabel } from "../../../lib/marketplace/hired";
import type { Booking, BookingReview, BookingStatus, ChangeOrder } from "../../../lib/marketplace/types";
import { useToast } from "../../../hooks/useToast";
import { ContactSharePanel } from "../../../components/marketplace/ContactSharePanel";
import { HiredConfirmationCard, ProfileReviewForm } from "../../../components/marketplace/HiredConfirmation";

function statusLabel(status: string) {
  return BOOKING_STATUS_LABELS[status as BookingStatus] ?? status.replaceAll("_", " ");
}

export function CustomerBookingsPage() {
  const { profile } = useAuth();
  const [rows, setRows] = useState<Booking[]>([]);
  const [titles, setTitles] = useState<Record<string, string>>({});
  const [names, setNames] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!profile) return;
    void expireStalePendingBookings()
      .then(() => Promise.all([fetchMyBookings("customer", profile.id), fetchCustomerProjects(profile.id)]))
      .then(async ([data, projects]) => {
        const bookings = data as Booking[];
        setRows(bookings);
        setTitles(Object.fromEntries(projects.map((project) => [project.id, project.title || "Project"])));
        const ids = [...new Set(bookings.map((row) => row.contractor_profile_id))];
        const pros = await Promise.all(ids.map((id) => fetchPublicContractor(id).catch(() => null)));
        setNames(Object.fromEntries(ids.map((id, index) => [id, pros[index]?.display_label || "Local pro"])));
      })
      .catch((err: Error) => setError(err.message));
  }, [profile]);

  return (
    <div className="space-y-6">
      <h1 className="font-display text-4xl font-semibold text-forest-800">Bookings</h1>
        <p className="text-ink-700">Selecting a pro starts a booking. {CUSTOMER_PAYS_DIRECTLY}</p>
      <FormError message={error} />
      {rows.length === 0 ? (
        <EmptyState title="No bookings yet" body="When you select a contractor, the booking will wait here. Nothing is marked paid." />
      ) : (
        <ul className="space-y-3">
          {rows.map((row) => {
            const hiredLabel = bookingListHiredLabel({
              bookingStatus: row.status,
              customerHiredAt: row.customer_hired_at,
              contractorHiredAt: row.contractor_hired_at,
            });
            return (
            <li key={row.id} className="rounded-3xl border border-forest-800/10 bg-cream-50 px-5 py-4">
              <p className="font-semibold text-forest-800">{titles[row.project_id] || "Project"}</p>
              <p className="text-sm text-ink-700">{names[row.contractor_profile_id] || "Local pro"}</p>
              <p className="mt-1 text-sm text-ink-500">{hiredLabel ?? statusLabel(row.status)}</p>
              <p className="mt-1 text-sm text-ink-500">
                Job {formatUsdFromCents(row.billable_amount_cents || row.amount_cents)}
              </p>
              <Link to={`/app/customer/bookings/${row.id}`} className="mt-3 inline-flex min-h-11 items-center font-semibold text-forest-800 underline">
                View booking
              </Link>
            </li>
            );
          })}
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
  const [reviews, setReviews] = useState<BookingReview[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [delta, setDelta] = useState("");
  const [note, setNote] = useState("");
  const [rating, setRating] = useState("5");
  const [body, setBody] = useState("");
  const [busy, setBusy] = useState(false);
  const [disputeOpen, setDisputeOpen] = useState(false);

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

  const canCancel = canCustomerCancelPendingBooking({
    status: booking.status,
    customerHiredAt: booking.customer_hired_at,
    contractorHiredAt: booking.contractor_hired_at,
  });
  const canStart = canStartBooking("CUSTOMER", booking.status);

  return (
    <div className="space-y-6">
      <header>
        <p className="text-[0.72rem] font-semibold uppercase tracking-[0.22em] text-gold-600">{statusLabel(booking.status)}</p>
        <h1 className="mt-2 font-display text-4xl font-semibold text-forest-800">{title}</h1>
        <p className="mt-2 text-ink-700">{contractor}</p>
      </header>
      <FormError message={error} />
      <HiredConfirmationCard
        role="customer"
        bookingStatus={booking.status}
        customerHiredAt={booking.customer_hired_at}
        contractorHiredAt={booking.contractor_hired_at}
        contractorProfileId={booking.contractor_profile_id}
        busy={busy}
        onConfirm={() => {
          setBusy(true);
          void confirmBookingHired(booking.id)
            .then(() => {
              toast.push("Hired confirmed.");
              return reload();
            })
            .catch((err: Error) => setError(err.message))
            .finally(() => setBusy(false));
        }}
      />
      <section className="rounded-3xl border border-forest-800/10 bg-cream-50 px-5 py-4 text-sm">
        <p>Job total {formatUsdFromCents(booking.billable_amount_cents || booking.amount_cents)}</p>
        <p className="mt-2 text-ink-500">{CUSTOMER_PAYS_DIRECTLY}</p>
      </section>
      <ContactSharePanel
        role="customer"
        projectId={booking.project_id}
        contractorProfileId={booking.contractor_profile_id}
      />
      {canCancel ? (
        <Button
          type="button"
          variant="outline"
          className="min-h-14 w-full"
          disabled={busy}
          onClick={() => {
            setBusy(true);
            void cancelPendingBooking(booking.id)
              .then(() => {
                toast.push("Booking cancelled. Your street address was not shared.");
                return reload();
              })
              .catch((err: Error) => setError(err.message))
              .finally(() => setBusy(false));
          }}
        >
          Cancel this booking
        </Button>
      ) : null}
      {canStart ? (
        <Button
          type="button"
          className="min-h-14 w-full"
          disabled={busy}
          onClick={() => {
            setBusy(true);
            void startBooking(booking.id)
              .then(() => {
                toast.push("Job started.");
                return reload();
              })
              .catch((err: Error) => setError(err.message))
              .finally(() => setBusy(false));
          }}
        >
          Start job
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
          disabled={busy}
          onClick={() => setDisputeOpen(true)}
        >
          Open a dispute
        </Button>
      ) : null}
      <ConfirmDialog
        open={disputeOpen}
        title="Open a dispute?"
        body="This flags the booking so both sides can pause and sort it out. It does not charge anyone."
        confirmLabel="Open a dispute"
        busy={busy}
        onClose={() => setDisputeOpen(false)}
        onConfirm={() => {
          setBusy(true);
          void disputeBooking(booking.id)
            .then(() => {
              setDisputeOpen(false);
              return reload();
            })
            .catch((err: Error) => setError(err.message))
            .finally(() => setBusy(false));
        }}
      />

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
                    <Button
                      type="button"
                      size="sm"
                      disabled={busy}
                      onClick={() => {
                        setBusy(true);
                        void respondChangeOrder(order.id, true)
                          .then(reload)
                          .catch((err: Error) => setError(err.message))
                          .finally(() => setBusy(false));
                      }}
                    >
                      Approve
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      disabled={busy}
                      onClick={() => {
                        setBusy(true);
                        void respondChangeOrder(order.id, false)
                          .then(reload)
                          .catch((err: Error) => setError(err.message))
                          .finally(() => setBusy(false));
                      }}
                    >
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

      <ProfileReviewForm
        role="customer"
        bookingStatus={booking.status}
        mutuallyHired={isMutuallyHired({
          customerHiredAt: booking.customer_hired_at,
          contractorHiredAt: booking.contractor_hired_at,
        })}
        reviews={reviews}
        rating={rating}
        body={body}
        onRatingChange={setRating}
        onBodyChange={setBody}
        onSubmit={() => {
          void submitBookingReview(booking.id, Number(rating), body)
            .then(() => reload())
            .catch((err: Error) => setError(err.message));
        }}
      />
      <ButtonLink to={`/app/customer/projects/${booking.project_id}`} variant="ghost">
        Back to project
      </ButtonLink>
    </div>
  );
}

export function HireAgainPage() {
  const [rows, setRows] = useState<RpcJson[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void fetchHireAgainContractors()
      .then(setRows)
      .catch((err: Error) => setError(err.message));
  }, []);

  return (
    <div className="space-y-6">
      <h1 className="font-display text-4xl font-semibold text-forest-800">Hire again</h1>
      <p className="text-ink-700">{HIRE_AGAIN_INTRO}</p>
      <FormError message={error} />
      {rows.length === 0 ? (
        <EmptyState
          title="No Hire Again pros yet"
          body={HIRE_AGAIN_EMPTY}
        />
      ) : (
        <ul className="space-y-3">
          {rows.map((row) => (
            <li key={String(row.relationship_id)} className="rounded-3xl border border-forest-800/10 px-5 py-4">
              <p className="font-semibold text-forest-800">{String(row.business_name)}</p>
              <ButtonLink
                to={customerWizardPath({
                  contractorId: typeof row.contractor_profile_id === "string" ? row.contractor_profile_id : null,
                  trade: typeof row.primary_trade === "string" ? row.primary_trade : null,
                })}
                className="mt-3 min-h-14 w-full"
              >
                Post a new project
              </ButtonLink>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
