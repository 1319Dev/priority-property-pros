import { useEffect, useState } from "react";
import { Navigate, useParams } from "react-router-dom";
import { BrandLoader } from "../../../components/brand/BrandLoader";
import { EmptyState } from "../../../components/layout/DashboardShell";
import { ChangeOrderPanel } from "../../../components/marketplace/ChangeOrderPanel";
import { JobReference } from "../../../components/marketplace/JobReference";
import { Button, ButtonLink } from "../../../components/ui/Button";
import { ConfirmDialog } from "../../../components/ui/ConfirmDialog";
import { FormError } from "../../../lib/auth/AuthCard";
import { useAuth } from "../../../lib/auth/useAuth";
import {
  completeBooking,
  confirmBookingHired,
  fetchBooking,
  fetchBookingJobContact,
  fetchBookingReviews,
  fetchChangeOrders,
  fetchContractorProfileByUser,
  fetchEstimate,
  fetchEstimateItems,
  fetchMyBookings,
  fetchProject,
  proposeChangeOrder,
  respondChangeOrder,
  startBooking,
  submitBookingReview,
  updateBookingReview,
} from "../../../lib/marketplace/api";
import { BOOKING_STATUS_LABELS, paymentsComingSoonCopy } from "../../../lib/marketplace/bookings";
import {
  CONTRACTOR_CONTACT_LOCKED_COPY,
  CONTRACTOR_CONTACT_WAITING_COPY,
  MARK_COMPLETE_BODY,
  MARK_COMPLETE_CANCEL,
  MARK_COMPLETE_CONFIRM,
  MARK_COMPLETE_TITLE,
  customerPlaceLine,
  formatPhoneDisplay,
  projectContactFromRpc,
  type ProjectContactView,
} from "../../../lib/marketplace/contractorPolish";
import { JobThreadPanel } from "../../../components/marketplace/JobThreadPanel";
import { HiredJobsPanel } from "../../../components/marketplace/HiredJobsPanel";
import { HiredJobStatusChip } from "../../../components/marketplace/HiredJobsSection";
import { formatUsdFromCents } from "../../../lib/marketplace/fees";
import { startComparisonLabel } from "../../../lib/marketplace/estimateComparison";
import { customerFirstNameFromLabel, hiredJobChip, hiredJobNextStep, hiredJobPath, isSafeRecordId } from "../../../lib/marketplace/hiredJobs";
import { friendlyNotFound, isQueryableId } from "../../../lib/marketplace/recordId";
import { isMutuallyHired } from "../../../lib/marketplace/hired";
import { listMyMessageThreads } from "../../../lib/marketplace/messagingApi";
import { ESTIMATE_ITEM_KIND_LABELS, type Booking, type BookingReview, type BookingStatus, type ChangeOrder, type EstimateItemKind } from "../../../lib/marketplace/types";
import { useToast } from "../../../hooks/useToast";
import { HiredConfirmationCard, ProfileReviewForm } from "../../../components/marketplace/HiredConfirmation";

function statusLabel(status: string) {
  return BOOKING_STATUS_LABELS[status as BookingStatus] ?? status.replaceAll("_", " ");
}

export function ProjectContactSection({ view }: { view: ProjectContactView }) {
  return (
    <section className="rounded-3xl border border-forest-800/10 px-5 py-4 text-sm">
      <h2 className="font-display text-2xl text-forest-800">Project Contact</h2>
      {view.state === "shared" ? (
        <dl className="mt-3 space-y-2">
          <div>
            <dt className="text-xs font-semibold uppercase tracking-[0.16em] text-gold-700">Name</dt>
            <dd className="mt-1 font-semibold text-forest-800">{view.contact.name || "Not provided"}</dd>
          </div>
          <div>
            <dt className="text-xs font-semibold uppercase tracking-[0.16em] text-gold-700">Street</dt>
            <dd className="mt-1 font-semibold text-forest-800">{view.contact.street || "Not provided"}</dd>
          </div>
          <div>
            <dt className="text-xs font-semibold uppercase tracking-[0.16em] text-gold-700">Phone</dt>
            <dd className="mt-1 font-semibold text-forest-800">{formatPhoneDisplay(view.contact.phone) || "Not provided"}</dd>
          </div>
          <div>
            <dt className="text-xs font-semibold uppercase tracking-[0.16em] text-gold-700">Email</dt>
            <dd className="mt-1 font-semibold text-forest-800">{view.contact.email || "Not provided"}</dd>
          </div>
        </dl>
      ) : view.state === "waiting" ? (
        <p className="mt-3 leading-relaxed text-ink-700">{CONTRACTOR_CONTACT_WAITING_COPY}</p>
      ) : (
        <p className="mt-3 leading-relaxed text-ink-700">{CONTRACTOR_CONTACT_LOCKED_COPY}</p>
      )}
    </section>
  );
}

export function ProBookingsPage() {
  return (
    <div className="space-y-6">
      <header>
        <h1 className="font-display text-4xl font-semibold text-forest-800">Bookings</h1>
        <p className="mt-2 max-w-xl text-sm text-ink-700">
          Hired jobs are listed under Jobs. This page stays available and shows the same list.
        </p>
      </header>
      <ButtonLink to="/app/pro/opportunities?tab=hired" variant="outline">
        Open Hired jobs
      </ButtonLink>
      <HiredJobsPanel showHeading={false} />
    </div>
  );
}

export function ProBookingDetailPage() {
  const { bookingId = "" } = useParams();
  const toast = useToast();
  const [booking, setBooking] = useState<Booking | null>(null);
  const [title, setTitle] = useState("");
  const [referenceNumber, setReferenceNumber] = useState<number | null>(null);
  const [cityZip, setCityZip] = useState("");
  const [contactView, setContactView] = useState<ProjectContactView>({ state: "locked" });
  const [completeOpen, setCompleteOpen] = useState(false);
  const [orders, setOrders] = useState<ChangeOrder[]>([]);
  const [reviews, setReviews] = useState<BookingReview[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [rating, setRating] = useState("5");
  const [body, setBody] = useState("");
  const [busy, setBusy] = useState(false);
  const [ready, setReady] = useState(false);
  const [customerLabel, setCustomerLabel] = useState("Customer");
  const [estimateLines, setEstimateLines] = useState<Array<{ id: string; label: string }>>([]);
  const [estimateMeta, setEstimateMeta] = useState<{ total: number; notes: string | null; timeline: string; start: string } | null>(null);

  async function reload() {
    const row = (await fetchBooking(bookingId)) as Booking;
    setBooking(row);
    const project = await fetchProject(row.project_id);
    setTitle(project.title);
    setReferenceNumber(project.reference_number ?? null);
    setCityZip([project.city, project.state, project.zip_code].filter(Boolean).join(", "));
    setOrders((await fetchChangeOrders(bookingId)) as ChangeOrder[]);
    setReviews(await fetchBookingReviews(bookingId));
    const threads = await listMyMessageThreads().catch(() => []);
    const thread = threads.find((item) => item.project_id === row.project_id);
    setCustomerLabel(customerFirstNameFromLabel(thread?.other_party_label));
    const estimate = await fetchEstimate(row.estimate_id).catch(() => null);
    if (estimate && estimate.project_id === row.project_id) {
      const items = await fetchEstimateItems(estimate.id).catch(() => []);
      setEstimateMeta({
        total: estimate.total_cents,
        notes: estimate.notes,
        timeline: estimate.duration_hours != null ? `${estimate.duration_hours} hours` : "Not stated",
        start: startComparisonLabel(estimate.available_from),
      });
      setEstimateLines(
        items.map((item) => ({
          id: item.id,
          label: `${ESTIMATE_ITEM_KIND_LABELS[(item.kind as EstimateItemKind) ?? "CUSTOM"]}: ${item.label}`,
        })),
      );
    } else {
      setEstimateMeta(null);
      setEstimateLines([]);
    }
    try {
      const payload = await fetchBookingJobContact(row.id);
      setContactView(projectContactFromRpc(payload));
    } catch {
      setContactView({ state: "locked" });
    }
  }

  useEffect(() => {
    if (!isQueryableId(bookingId)) return;
    setReady(false);
    void reload()
      .catch((err: Error) => setError(friendlyNotFound(err.message, "We couldn't open that job.")))
      .finally(() => setReady(true));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bookingId]);

  if (!isQueryableId(bookingId)) {
    return <EmptyState title="Job not found" body="Check the link, or open the job from Hired jobs." />;
  }
  if (!ready || !booking) {
    return error && ready ? (
      <EmptyState title="Job not found" body={friendlyNotFound(error, "We couldn't open that job.")} />
    ) : (
      <BrandLoader layout="section" label="Loading job" />
    );
  }
  const pending = booking.status === "PENDING" || booking.status === "AWAITING_PAYMENT";
  const chip = hiredJobChip({
    bookingStatus: booking.status,
    customerHiredAt: booking.customer_hired_at,
    contractorHiredAt: booking.contractor_hired_at,
  });
  const pendingOrders = orders.filter((order) => order.status === "PROPOSED").length;
  const nextStep = hiredJobNextStep({
    bookingStatus: booking.status,
    customerHiredAt: booking.customer_hired_at,
    contractorHiredAt: booking.contractor_hired_at,
    pendingChangeOrders: pendingOrders,
  });
  const cityOnly = cityZip.split(",")[0]?.trim() || "City not listed";

  return (
    <div className="space-y-6">
      {chip ? <HiredJobStatusChip chip={chip} /> : <p className="text-sm text-ink-500">{statusLabel(booking.status)}</p>}
      <h1 className="font-display text-4xl font-semibold text-forest-800">{title}</h1>
      <JobReference value={referenceNumber} />
      <p className="text-sm text-ink-700">{customerPlaceLine(customerLabel, cityOnly)}</p>
      <p className="text-sm font-semibold text-forest-800">Next: {nextStep}</p>
      <FormError message={error} />
      {pending ? <p className="rounded-3xl bg-cream-100 px-5 py-4 text-sm font-semibold">{paymentsComingSoonCopy()}</p> : null}
      <HiredConfirmationCard
        role="contractor"
        bookingStatus={booking.status}
        customerHiredAt={booking.customer_hired_at}
        contractorHiredAt={booking.contractor_hired_at}
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
      <section className="rounded-3xl border border-forest-800/10 px-5 py-4 text-sm">
        <p className="font-semibold">Approximate location</p>
        <p>{cityZip}</p>
        <p className="mt-3">Job {formatUsdFromCents(booking.billable_amount_cents || booking.amount_cents)}</p>
        <p className="text-ink-500">{paymentsComingSoonCopy()}</p>
      </section>
      {estimateMeta ? (
        <section className="rounded-3xl border border-forest-800/10 bg-cream-50 px-5 py-4 text-sm" aria-label="Estimate">
          <h2 className="font-display text-2xl text-forest-800">Estimate</h2>
          <p className="mt-2 text-lg font-semibold text-forest-800">{formatUsdFromCents(estimateMeta.total)}</p>
          <ul className="mt-3 space-y-1">
            {estimateLines.map((item) => (
              <li key={item.id}>{item.label}</li>
            ))}
          </ul>
          <p className="mt-3">Timeline: {estimateMeta.timeline}</p>
          <p>Start: {estimateMeta.start}</p>
          {estimateMeta.notes ? <p className="mt-3">{estimateMeta.notes}</p> : null}
        </section>
      ) : null}
      <JobThreadPanel
        projectId={booking.project_id}
        contractorProfileId={booking.contractor_profile_id}
        customerLabel={customerLabel}
        contactShared={contactView.state === "shared"}
      />
      <ProjectContactSection view={contactView} />
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
      {(booking.status === "CONFIRMED" || booking.status === "IN_PROGRESS") && (
        <ChangeOrderPanel
          role="contractor"
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
      {booking.status === "IN_PROGRESS" ? (
        <Button type="button" variant="outline" className="min-h-14 w-full" onClick={() => setCompleteOpen(true)}>
          Mark complete
        </Button>
      ) : null}
      <ConfirmDialog
        open={completeOpen}
        title={MARK_COMPLETE_TITLE}
        body={MARK_COMPLETE_BODY}
        confirmLabel={MARK_COMPLETE_CONFIRM}
        cancelLabel={MARK_COMPLETE_CANCEL}
        tone="primary"
        busy={busy}
        onClose={() => {
          if (!busy) setCompleteOpen(false);
        }}
        onConfirm={() => {
          setBusy(true);
          void completeBooking(booking.id)
            .then(() => {
              toast.push("Job marked complete.");
              setCompleteOpen(false);
              return reload();
            })
            .catch((err: Error) => setError(err.message))
            .finally(() => setBusy(false));
        }}
      />
      <ProfileReviewForm
        role="contractor"
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
        onSubmit={(nextRating, nextBody) => {
          const own = reviews.some((review) => review.reviewer_role === "CONTRACTOR");
          const save = own ? updateBookingReview : submitBookingReview;
          return save(booking.id, Number(nextRating), nextBody)
            .then(() => reload())
            .catch((err: Error) => {
              setError(err.message);
              throw err;
            });
        }}
      />
    </div>
  );
}

export function ProBookingRedirect() {
  const { bookingId = "" } = useParams();
  if (!isSafeRecordId(bookingId)) return <Navigate to="/app/pro/opportunities?tab=hired" replace />;
  return <Navigate to={hiredJobPath(bookingId)} replace />;
}

export function ProHiredJobByProjectPage() {
  const { projectId = "" } = useParams();
  const { user } = useAuth();
  const [target, setTarget] = useState<string | null>(null);
  const [missing, setMissing] = useState(false);

  useEffect(() => {
    if (!user || !isSafeRecordId(projectId)) {
      setMissing(true);
      return;
    }
    let stop = false;
    void fetchContractorProfileByUser(user.id)
      .then((profile) => {
        if (!profile) throw new Error("Contractor profile missing.");
        return fetchMyBookings("contractor", profile.id);
      })
      .then((rows) => {
        if (stop) return;
        const match = (rows as Booking[]).find(
          (row) => row.project_id === projectId && hiredJobChip({ bookingStatus: row.status, customerHiredAt: row.customer_hired_at, contractorHiredAt: row.contractor_hired_at }),
        );
        if (match && isSafeRecordId(match.id)) setTarget(hiredJobPath(match.id));
        else setMissing(true);
      })
      .catch(() => {
        if (!stop) setMissing(true);
      });
    return () => {
      stop = true;
    };
  }, [projectId, user]);

  if (target) return <Navigate to={target} replace />;
  if (missing) {
    return (
      <EmptyState
        title="This hired job is not on your list"
        body="Open Hired jobs to see work a customer selected you for."
      />
    );
  }
  return <BrandLoader layout="section" label="Opening job" />;
}
