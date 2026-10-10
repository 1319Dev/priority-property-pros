import { useEffect, useState } from "react";
import { useAuth } from "../../lib/auth/useAuth";
import { fetchChangeOrders, fetchContractorProfileByUser, fetchMyBookings, fetchProject } from "../../lib/marketplace/api";
import {
  sortHiredJobCards,
  toHiredJobCard,
  type HiredJobCardModel,
} from "../../lib/marketplace/hiredJobs";
import { listMyMessageThreads } from "../../lib/marketplace/messagingApi";
import type { Booking, BookingStatus } from "../../lib/marketplace/types";
import { HiredJobsSection } from "./HiredJobsSection";

export function HiredJobsPanel({ heading = "Hired jobs", showHeading = true }: { heading?: string; showHeading?: boolean }) {
  const { user } = useAuth();
  const [jobs, setJobs] = useState<HiredJobCardModel[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) return;
    let stop = false;
    void (async () => {
      try {
        const profile = await fetchContractorProfileByUser(user.id);
        if (!profile) {
          if (!stop) setJobs([]);
          return;
        }
        const [bookings, threads] = await Promise.all([
          fetchMyBookings("contractor", profile.id) as Promise<Booking[]>,
          listMyMessageThreads().catch(() => []),
        ]);
        const names = new Map(threads.map((thread) => [thread.project_id, thread.other_party_label]));
        const cards = await Promise.all(
          bookings.map(async (booking) => {
            const [project, orders] = await Promise.all([
              fetchProject(booking.project_id).catch(() => null),
              fetchChangeOrders(booking.id).catch(() => []),
            ]);
            return toHiredJobCard({
              bookingId: booking.id,
              projectId: booking.project_id,
              bookingStatus: booking.status as BookingStatus,
              customerHiredAt: booking.customer_hired_at,
              contractorHiredAt: booking.contractor_hired_at,
              title: project?.title ?? "Project",
              referenceNumber: project?.reference_number ?? null,
              city: project?.city ?? null,
              customerLabel: names.get(booking.project_id) ?? null,
              pendingChangeOrders: orders.filter((order) => order.status === "PROPOSED").length,
            });
          }),
        );
        if (!stop) setJobs(sortHiredJobCards(cards.flatMap((card) => (card ? [card] : []))));
      } catch {
        if (!stop) setJobs([]);
      } finally {
        if (!stop) setLoading(false);
      }
    })();
    return () => {
      stop = true;
    };
  }, [user]);

  if (loading) return null;
  return <HiredJobsSection jobs={jobs} heading={heading} showHeading={showHeading} />;
}
