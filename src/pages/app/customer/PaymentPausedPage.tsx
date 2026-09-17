import { useEffect, useState } from "react";
import { Navigate, useParams } from "react-router-dom";
import { ButtonLink } from "../../../components/ui/Button";
import { LoadingState } from "../../../components/ui/PageState";
import { HumanStatus, StatusBanner } from "../../../components/ui/StatusBanner";
import { fetchBooking, fetchMyCustomerProject } from "../../../lib/marketplace/api";
import {
  contactLockedUntilConfirmedCopy,
  paymentsComingSoonCopy,
  preBookingHeadline,
  preBookingTitle,
  selectionDoesNotConfirmCopy,
} from "../../../lib/marketplace/bookings";
import type { Booking, Project } from "../../../lib/marketplace/types";

export function PaymentPausedPanel({
  projectId,
  bookingId,
}: {
  projectId?: string | null;
  bookingId?: string | null;
}) {
  const projectTo = projectId ? `/app/customer/projects/${projectId}` : "/app/customer/projects";
  const bookingTo = bookingId ? `/app/customer/bookings/${bookingId}` : null;

  return (
    <div className="space-y-6 pb-4" data-pre-booking-paused="">
      <header>
        <HumanStatus label="Pre-booking" />
        <h1 className="mt-2 font-display text-4xl font-semibold text-forest-800">{preBookingTitle()}</h1>
        <p className="mt-3 text-lg font-semibold text-forest-800">{preBookingHeadline()}</p>
        <p className="mt-2 text-ink-700">{selectionDoesNotConfirmCopy()}</p>
      </header>
      <StatusBanner tone="info" title={paymentsComingSoonCopy()} body={contactLockedUntilConfirmedCopy()} />
      <ul className="space-y-2 rounded-3xl border border-forest-800/10 bg-cream-50 px-5 py-4 text-sm text-ink-700">
        <li>No payment was taken.</li>
        <li>The job is not booked yet.</li>
        <li>Exact address, phone, and email stay private.</li>
      </ul>
      <div className="flex min-w-0 flex-col gap-3">
        <ButtonLink to={projectTo} size="lg" className="min-h-14 w-full">
          Return to project
        </ButtonLink>
        {bookingTo ? (
          <ButtonLink to={bookingTo} variant="outline" size="lg" className="min-h-14 w-full">
            View booking details
          </ButtonLink>
        ) : null}
      </div>
    </div>
  );
}

export function CustomerPayGatePage() {
  const { bookingId = "" } = useParams();
  const [booking, setBooking] = useState<Booking | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    void fetchBooking(bookingId)
      .then((row) => {
        if (!cancelled) setBooking(row as Booking);
      })
      .catch(() => {
        if (!cancelled) setBooking(null);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [bookingId]);

  if (loading) return <LoadingState label="Loading booking" />;

  if (booking && booking.status !== "PENDING" && booking.status !== "AWAITING_PAYMENT") {
    return <Navigate to={`/app/customer/bookings/${booking.id}`} replace />;
  }

  return <PaymentPausedPanel bookingId={booking?.id ?? bookingId} projectId={booking?.project_id ?? null} />;
}

export function CustomerPreBookingPage() {
  const { projectId = "" } = useParams();
  const [project, setProject] = useState<Project | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    void fetchMyCustomerProject(projectId)
      .then((row) => {
        if (!cancelled) setProject(row);
      })
      .catch(() => {
        if (!cancelled) setProject(null);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [projectId]);

  if (loading) return <LoadingState label="Loading project" />;

  return (
    <PaymentPausedPanel projectId={project?.id ?? projectId} bookingId={project?.selected_booking_id ?? null} />
  );
}
