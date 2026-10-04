import { useEffect, useState } from "react";
import { EmptyState } from "../../../components/layout/DashboardShell";
import { Button } from "../../../components/ui/Button";
import { ErrorState, LoadingState } from "../../../components/ui/PageState";
import { FormError } from "../../../lib/auth/AuthCard";
import { fetchContractorReviewsForAdmin, moderateBookingReview } from "../../../lib/marketplace/api";
import {
  REPORT_REASON_LABELS,
  VERIFIED_PPP_BADGE,
  isReviewReportReason,
  parseAdminContractorReviews,
  type AdminContractorReview,
  type ReviewModerationAction,
} from "../../../lib/marketplace/contractorReviews";
import { isSupabaseConfigured } from "../../../lib/supabase/config";

const ACTIONS: Array<{ action: ReviewModerationAction; label: string }> = [
  { action: "keep_published", label: "Keep published" },
  { action: "hide", label: "Hide" },
  { action: "restore", label: "Restore" },
  { action: "remove", label: "Remove for policy" },
];

export function AdminContractorReviewQueue({
  reviews,
  busyId,
  onModerate,
}: {
  reviews: AdminContractorReview[];
  busyId: string | null;
  onModerate: (reviewId: string, action: ReviewModerationAction) => void;
}) {
  if (reviews.length === 0) {
    return <EmptyState title="No contractor reviews yet" body="Homeowner reviews of hired pros will land here." />;
  }
  return (
    <ul className="space-y-4">
      {reviews.map((review) => (
        <li key={review.id} className="max-w-full rounded-3xl border border-forest-800/10 bg-cream-50 px-5 py-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="font-semibold text-forest-800">{review.displayLabel}</p>
            <p className="text-xs font-semibold uppercase tracking-[0.14em] text-gold-700">{review.moderationStatus}</p>
          </div>
          <p className="mt-1 text-sm text-forest-800">★ {review.rating.toFixed(1)}</p>
          {review.verified ? <p className="mt-1 text-xs font-semibold uppercase tracking-[0.14em] text-gold-700">{VERIFIED_PPP_BADGE}</p> : null}
          <p className="mt-2 text-sm leading-relaxed text-ink-700">{review.body}</p>
          <p className="mt-2 text-sm text-ink-500">
            {review.homeownerDisplay || "Homeowner"}
            {review.category ? ` · ${review.category}` : ""}
          </p>
          {review.reports.length > 0 ? (
            <ul className="mt-3 space-y-1 text-sm text-ink-700" aria-label="Reports">
              {review.reports.map((report) => (
                <li key={report.id}>
                  Report: {isReviewReportReason(report.reason) ? REPORT_REASON_LABELS[report.reason] : report.reason}
                  {report.note ? ` — ${report.note}` : ""}
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-3 text-sm text-ink-500">No reports. Reporting does not hide a review.</p>
          )}
          {review.events.length > 0 ? (
            <ul className="mt-3 space-y-1 text-sm text-ink-500" aria-label="Moderation history">
              {review.events.map((event) => (
                <li key={event.id}>
                  {event.action.replaceAll("_", " ")}: {event.fromStatus} → {event.toStatus}
                </li>
              ))}
            </ul>
          ) : null}
          <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:flex-wrap">
            {ACTIONS.map((item) => (
              <Button
                key={item.action}
                type="button"
                size="sm"
                variant={item.action === "remove" ? "ghost" : "outline"}
                className="min-h-11"
                disabled={busyId === review.id}
                onClick={() => onModerate(review.id, item.action)}
              >
                {item.label}
              </Button>
            ))}
          </div>
        </li>
      ))}
    </ul>
  );
}

export function AdminContractorReviewsPage() {
  const configured = isSupabaseConfigured();
  const [reviews, setReviews] = useState<AdminContractorReview[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(configured);
  const [busyId, setBusyId] = useState<string | null>(null);

  function load() {
    setLoading(true);
    setError(null);
    void fetchContractorReviewsForAdmin()
      .then((payload) => setReviews(parseAdminContractorReviews(payload)))
      .catch((err: unknown) => setError(err instanceof Error ? err.message : "Could not load contractor reviews."))
      .finally(() => setLoading(false));
  }

  useEffect(() => {
    if (!configured) return;
    load();
  }, [configured]);

  async function onModerate(reviewId: string, action: ReviewModerationAction) {
    setBusyId(reviewId);
    setError(null);
    try {
      await moderateBookingReview(reviewId, action);
      const payload = await fetchContractorReviewsForAdmin();
      setReviews(parseAdminContractorReviews(payload));
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Could not moderate that review.");
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div className="space-y-6">
      <header>
        <p className="text-[0.72rem] font-semibold uppercase tracking-[0.22em] text-gold-600">Admin</p>
        <h1 className="mt-2 font-display text-4xl font-semibold text-forest-800">Contractor reviews</h1>
        <p className="mt-3 max-w-xl text-ink-700">
          Keep a review published, hide it, restore it, or remove it for policy. A report does not hide anything on its
          own. This screen cannot create a review or assign the verified badge.
        </p>
      </header>
      {!configured ? <EmptyState title="Marketplace not connected" body="Contractor reviews need Supabase." /> : null}
      {loading ? <LoadingState label="Loading contractor reviews" /> : null}
      {error && reviews.length === 0 ? <ErrorState message={error} onRetry={load} /> : null}
      {error && reviews.length > 0 ? <FormError message={error} /> : null}
      {!loading && configured && (reviews.length > 0 || !error) ? (
        <AdminContractorReviewQueue reviews={reviews} busyId={busyId} onModerate={(id, action) => void onModerate(id, action)} />
      ) : null}
    </div>
  );
}
