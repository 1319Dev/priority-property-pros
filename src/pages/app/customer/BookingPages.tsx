import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { BrandLoader } from "../../../components/brand/BrandLoader";
import { EmptyState } from "../../../components/layout/DashboardShell";
import { ChangeOrderPanel } from "../../../components/marketplace/ChangeOrderPanel";
import { JobReference } from "../../../components/marketplace/JobReference";
import { Button, ButtonLink } from "../../../components/ui/Button";
import { ConfirmDialog } from "../../../components/ui/ConfirmDialog";
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
import { formatUsdFromCents } from "../../../lib/marketplace/fees";
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
  const [references, setReferences] = useState<Record<string, number | null | undefined>>({});
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
        setReferences(Object.fromEntries(projects.map((project) => [project.id, project.reference_number])));
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
              <JobReference value={references[row.project_id]} />
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
  const [referenceNumber, setReferenceNumber] = useState<number | null>(null);
  const [contractor, setContractor] = useState<string>("");
  const [orders, setOrders] = useState<ChangeOrder[]>([]);
  const [reviews, setReviews] = useState<BookingReview[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [rating, setRating] = useState("5");
  const [body, setBody] = useState("");
  const [busy, setBusy] = useState(false);
  const [disputeOpen, setDisputeOpen] = useState(false);

  async function reload() {
    const row = (await fetchBooking(bookingId)) as Booking;
    setBooking(row);
    const project = await fetchProject(row.project_id).catch(() => null);
    setTitle(project?.title ?? "Booking");
    setReferenceNumber(project?.reference_number ?? null);
    const pro = await fetchPublicContractor(row.contractor_profile_id).catch(() => null);
    setContractor(pro?.display_label ?? "Local pro");
    setOrders((await fetchChangeOrders(bookingId)) as ChangeOrder[]);
    setReviews(await fetchBookingReviews(bookingId));
  }

  useEffect(() => {
    void reload().catch((err: Error) => setError(err.message));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bookingId]);

  if (!booking) return error ? <p className="text-ink-500">{error}</p> : <BrandLoader layout="section" />;

  const canCancel = canCustomerCancelPendingBooking({
    status: booking.status,
    customerHiredAt: booking.customer_hired_at,
    contractorHiredAt: booking.contractor_hired_at,
  });
  const canStart = canStartBooking("CUSTOMER", booking.status);

  return (
    <div className="space-y-6">
      <header>
        <p className="text-xs font-semibold uppercase tracking-[0.22em] text-gold-600">{statusLabel(booking.status)}</p>
        <h1 className="mt-2 font-display text-4xl font-semibold text-forest-800">{title}</h1>
        <JobReference value={referenceNumber} />
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
        <ChangeOrderPanel
          role="customer"
          orders={orders}
          referenceNumber={referenceNumber}
          onPropose={async (description, cents) => {
            await proposeChangeOrder(booking.id, description, cents);
            await reload();
          }}
          onRespond={async (id, approve) => {
            await respondChangeOrder(id, approve);
            await reload();
          }}
        />
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
        referenceNumber={referenceNumber}
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
