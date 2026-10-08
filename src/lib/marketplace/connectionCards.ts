import { BOOKING_STATUS_LABELS } from "./bookings";
import type { BookingStatus } from "./types";
import { BOOKING_STATUSES } from "./types";

export type ProjectConnectionCard = {
  connection_id: string;
  contractor_profile_id: string;
  display_name: string;
  connection_status: string;
  booking_status: string | null;
  can_message: boolean;
};

const BOOKING_STATUS_SET = new Set<string>(BOOKING_STATUSES);

export function customerConnectionStatusLabel(status: string | null | undefined): string {
  if (status === "PAID" || status === "COMPLETED") return "Connected";
  if (status === "CANCELLED" || status === "FAILED" || status === "EXPIRED") return "Closed";
  return "Connection requested";
}

export function customerBookingStatusLabel(status: string | null | undefined): string | null {
  if (!status || !BOOKING_STATUS_SET.has(status)) return null;
  return BOOKING_STATUS_LABELS[status as BookingStatus];
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

/** Keeps the display fields only. Drops names, contact, and fee keys the card RPC must not surface. */
export function sanitizeConnectionCards(data: unknown): ProjectConnectionCard[] {
  const rows = Array.isArray(data) ? data : [];
  const cards: ProjectConnectionCard[] = [];
  for (const row of rows) {
    const value = asRecord(row);
    if (!value) continue;
    const connectionId = typeof value.connection_id === "string" ? value.connection_id : "";
    const contractorId = typeof value.contractor_profile_id === "string" ? value.contractor_profile_id : "";
    if (!connectionId || !contractorId) continue;
    const status = typeof value.connection_status === "string" ? value.connection_status : "";
    const booking = typeof value.booking_status === "string" ? value.booking_status : null;
    const name = typeof value.display_name === "string" ? value.display_name.trim() : "";
    cards.push({
      connection_id: connectionId,
      contractor_profile_id: contractorId,
      display_name: name || "Local pro",
      connection_status: status,
      booking_status: booking,
      can_message: value.can_message === true,
    });
  }
  return cards;
}
