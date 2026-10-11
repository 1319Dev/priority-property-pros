import { friendlyAdminError } from "./friendlyAdminError";
import { getSupabaseClient } from "../supabase/client";

export type AdminBookingReviewReport = {
  reason: string;
  created_at: string;
};

export type AdminBookingReview = {
  id: string;
  booking_id: string;
  reviewer_role: "CUSTOMER" | "CONTRACTOR";
  rating: number;
  body: string | null;
  created_at: string;
  hidden_at: string | null;
  hidden_reason: string | null;
  contractor_response: string | null;
  contractor_response_at: string | null;
  contractor_response_hidden_at: string | null;
  contractor_response_hidden_reason: string | null;
  reports: AdminBookingReviewReport[];
};

function client() {
  const supabase = getSupabaseClient();
  if (!supabase) throw new Error("Supabase is not configured yet.");
  return supabase;
}

function moderationError(error: { message: string; code?: string } | null, fallback: string): string {
  const raw = error?.message?.trim() ?? "";
  if (raw && !/syntax error|row-level security|permission denied|duplicate key|relation |column /i.test(raw)) {
    return raw;
  }
  return friendlyAdminError(error, fallback);
}

function asText(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value : null;
}

export function parseAdminBookingReview(value: unknown): AdminBookingReview | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const row = value as Record<string, unknown>;
  const id = asText(row.id);
  const bookingId = asText(row.booking_id);
  const role = row.reviewer_role === "CUSTOMER" || row.reviewer_role === "CONTRACTOR" ? row.reviewer_role : null;
  const rating = typeof row.rating === "number" ? row.rating : Number(row.rating);
  const createdAt = asText(row.created_at);
  if (!id || !bookingId || !role || !createdAt || !Number.isInteger(rating) || rating < 1 || rating > 5) return null;
  const reports = Array.isArray(row.reports)
    ? row.reports.flatMap((item) => {
        if (!item || typeof item !== "object" || Array.isArray(item)) return [];
        const report = item as Record<string, unknown>;
        const reason = asText(report.reason);
        const created = asText(report.created_at);
        if (!reason || !created) return [];
        return [{ reason, created_at: created }];
      })
    : [];
  return {
    id,
    booking_id: bookingId,
    reviewer_role: role,
    rating,
    body: asText(row.body),
    created_at: createdAt,
    hidden_at: asText(row.hidden_at),
    hidden_reason: asText(row.hidden_reason),
    contractor_response: asText(row.contractor_response),
    contractor_response_at: asText(row.contractor_response_at),
    contractor_response_hidden_at: asText(row.contractor_response_hidden_at),
    contractor_response_hidden_reason: asText(row.contractor_response_hidden_reason),
    reports,
  };
}

export async function adminListBookingReviews(): Promise<AdminBookingReview[]> {
  const { data, error } = await client().rpc("admin_list_booking_reviews");
  if (error) throw new Error(moderationError(error, "Could not load job reviews."));
  const rows = Array.isArray(data) ? data : [];
  return rows.flatMap((row) => {
    const parsed = parseAdminBookingReview(row);
    return parsed ? [parsed] : [];
  });
}

export async function adminHideBookingReview(reviewId: string, reason: string): Promise<void> {
  const { error } = await client().rpc("admin_hide_booking_review", {
    p_review_id: reviewId,
    p_reason: reason.trim(),
  });
  if (error) throw new Error(moderationError(error, "Could not hide that review."));
}

export async function adminRestoreBookingReview(reviewId: string, reason: string): Promise<void> {
  const { error } = await client().rpc("admin_restore_booking_review", {
    p_review_id: reviewId,
    p_reason: reason.trim(),
  });
  if (error) throw new Error(moderationError(error, "Could not restore that review."));
}

export async function adminHideBookingReviewResponse(reviewId: string, reason: string): Promise<void> {
  const { error } = await client().rpc("admin_hide_booking_review_response", {
    p_review_id: reviewId,
    p_reason: reason.trim(),
  });
  if (error) throw new Error(moderationError(error, "Could not hide that response."));
}
