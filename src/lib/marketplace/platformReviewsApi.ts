import { getSupabaseClient } from "../supabase/client";
import {
  canInsertPlatformReview,
  normalizePlatformReviewDraft,
  validatePlatformReviewDraft,
  type PlatformReview,
  type PlatformReviewDraft,
  type PlatformReviewStatus,
  type PublicPlatformReview,
} from "./platformReviews";

function client() {
  const supabase = getSupabaseClient();
  if (!supabase) throw new Error("Supabase is not configured yet.");
  return supabase;
}

function asError(error: { message: string } | null, fallback: string): string {
  return error?.message || fallback;
}

const PUBLIC_COLUMNS = "id, display_name, city, rating, body, created_at";

export async function fetchApprovedPlatformReviews(limit = 12): Promise<PublicPlatformReview[]> {
  const { data, error } = await client()
    .from("platform_reviews")
    .select(PUBLIC_COLUMNS)
    .eq("status", "APPROVED")
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) throw new Error(asError(error, "Could not load reviews."));
  return (data ?? []) as PublicPlatformReview[];
}

export async function fetchOwnPlatformReview(userId: string): Promise<PlatformReview | null> {
  const { data, error } = await client()
    .from("platform_reviews")
    .select("id, user_id, display_name, city, rating, body, status, created_at")
    .eq("user_id", userId)
    .maybeSingle();
  if (error) throw new Error(asError(error, "Could not load your review."));
  return (data as PlatformReview | null) ?? null;
}

export async function submitPlatformReview(input: {
  viewerId: string | null;
  draft: PlatformReviewDraft;
}): Promise<PlatformReview> {
  if (!canInsertPlatformReview({ viewerId: input.viewerId })) {
    throw new Error("Sign in to leave a review of Priority Property Pros.");
  }
  const normalized = normalizePlatformReviewDraft(input.draft);
  const invalid = validatePlatformReviewDraft(normalized);
  if (invalid) throw new Error(invalid);

  const { data, error } = await client()
    .from("platform_reviews")
    .insert({
      user_id: input.viewerId as string,
      display_name: normalized.display_name,
      city: normalized.city,
      rating: normalized.rating,
      body: normalized.body,
    })
    .select("id, user_id, display_name, city, rating, body, status, created_at")
    .single();
  if (error || !data) {
    const message = asError(error, "Could not save your review.");
    if (/platform_reviews_one_per_user|duplicate key/i.test(message)) {
      throw new Error("You already left a review.");
    }
    throw new Error(message);
  }
  return data as PlatformReview;
}

export async function adminListPlatformReviews(): Promise<PlatformReview[]> {
  const { data, error } = await client()
    .from("platform_reviews")
    .select("id, user_id, display_name, city, rating, body, status, created_at")
    .order("created_at", { ascending: false });
  if (error) throw new Error(asError(error, "Could not load platform reviews."));
  return (data ?? []) as PlatformReview[];
}

export async function adminSetPlatformReviewStatus(
  id: string,
  status: PlatformReviewStatus,
): Promise<void> {
  const { error } = await client().from("platform_reviews").update({ status }).eq("id", id);
  if (error) throw new Error(asError(error, "Could not update that review."));
}
