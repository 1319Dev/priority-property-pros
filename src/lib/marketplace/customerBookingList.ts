import type { Booking, Project } from "./types";

export type CustomerBookingListDeps = {
  expireStale: () => Promise<unknown>;
  fetchBookings: () => Promise<unknown[]>;
  fetchProjects: () => Promise<Project[]>;
};

export type CustomerBookingList = {
  bookings: Booking[];
  projects: Project[];
};

/**
 * Loads the homeowner Bookings list.
 *
 * The old page waited for `expire_stale_pending_bookings` before reading any
 * booking. If that housekeeping call failed, the list never loaded and the
 * page said "No bookings yet" even for a Hired (IN_PROGRESS) job. Expiring
 * stale requests is best effort now, and project titles are optional. Only a
 * failed bookings read is an error, and the page shows it as an error, not as
 * an empty list.
 */
export async function loadCustomerBookingList(deps: CustomerBookingListDeps): Promise<CustomerBookingList> {
  await deps.expireStale().catch(() => undefined);
  const [bookings, projects] = await Promise.all([
    deps.fetchBookings(),
    deps.fetchProjects().catch(() => [] as Project[]),
  ]);
  return { bookings: bookings as Booking[], projects };
}
