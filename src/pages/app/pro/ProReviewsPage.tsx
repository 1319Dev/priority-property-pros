import { useEffect, useState } from "react";
import { EmptyState } from "../../../components/layout/DashboardShell";
import { Button } from "../../../components/ui/Button";
import { ErrorState, LoadingState } from "../../../components/ui/PageState";
import { FormError } from "../../../lib/auth/AuthCard";
import { fetchMyContractorReviews, reportBookingReview, respondToBookingReview } from "../../../lib/marketplace/api";
import {
  NEW_ON_PPP,
  NO_REVIEWS_YET,
  REPORT_REASON_LABELS,
  REVIEW_REPORT_REASONS,
  VERIFIED_PPP_BADGE,
  decisionRatingLines,
  parseContractorReputation,
  validateContractorResponse,
  type ContractorDashboardReview,
  type ContractorReputation,
  type ReviewReportReason,
} from "../../../lib/marketplace/contractorReviews";
import { isSupabaseConfigured } from "../../../lib/supabase/config";

function reviewDate(value: string | null): string | null {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric" }).format(date);
}

export function ContractorReviewDashboard({
  reputation,
  onRespond,
  onReport,
  busyId = null,
}: {
  reputation: ContractorReputation;
  onRespond: (reviewId: string, body: string) => Promise<void>;
  onReport: (reviewId: string, reason: ReviewReportReason, note: string) => Promise<void>;
  busyId?: string | null;
}) {
  const lines = decisionRatingLines(reputation.ratingAverage, reputation.ratingCount);
  return (
    <div className="max-w-full space-y-6">
      <section className="rounded-3xl border border-forest-800/10 bg-cream-50 px-5 py-4" aria-label="Your rating">
        {lines.hasRating ? (
          <>
            <p className="font-display text-3xl text-forest-800">{lines.primary}</p>
            <p className="mt-2 text-sm text-ink-700">
              {reputation.verifiedCount} verified {reputation.verifiedCount === 1 ? "review" : "reviews"}
            </p>
          </>
        ) : (
          <>
            <p className="font-display text-3xl text-forest-800">{NO_REVIEWS_YET}</p>
            <p className="mt-2 text-sm text-ink-700">{NEW_ON_PPP}</p>
          </>
        )}
      </section>
      {reputation.reviews.length === 0 ? (
        <EmptyState title="No reviews yet" body="Homeowner reviews show up here after both of you confirm Hired and they write one." />
      ) : (
        <ul className="space-y-4">
          {reputation.reviews.map((review) => (
            <ContractorReviewItem
              key={review.id}
              review={review}
              busy={busyId === review.id}
              onRespond={onRespond}
              onReport={onReport}
            />
          ))}
        </ul>
      )}
    </div>
  );
}

function ContractorReviewItem({
  review,
  busy,
  onRespond,
  onReport,
}: {
  review: ContractorDashboardReview;
  busy: boolean;
  onRespond: (reviewId: string, body: string) => Promise<void>;
  onReport: (reviewId: string, reason: ReviewReportReason, note: string) => Promise<void>;
}) {
  const [response, setResponse] = useState(review.responseBody ?? "");
  const [reason, setReason] = useState<ReviewReportReason>("spam");
  const [note, setNote] = useState("");
  const [reporting, setReporting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const removed = review.moderationStatus === "REMOVED";
  const when = reviewDate(review.createdAt);

  return (
    <li className="max-w-full rounded-3xl border border-forest-800/10 bg-cream-50 px-5 py-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="font-semibold text-forest-800">★ {review.rating.toFixed(1)}</p>
        <p className="text-xs font-semibold uppercase tracking-[0.14em] text-gold-700">{review.moderationStatus}</p>
      </div>
      {review.verified ? <p className="mt-1 text-xs font-semibold uppercase tracking-[0.14em] text-gold-700">{VERIFIED_PPP_BADGE}</p> : null}
      <p className="mt-2 text-sm leading-relaxed text-ink-700">{removed ? "Removed for policy." : review.body}</p>
      <p className="mt-2 text-sm text-ink-500">
        {review.homeownerDisplay || "Homeowner"}
        {review.category ? ` · ${review.category}` : ""}
        {when ? ` · ${when}` : ""}
      </p>
      {removed ? null : (
        <form
          className="mt-4 space-y-2"
          onSubmit={(event) => {
            event.preventDefault();
            const message = validateContractorResponse(response);
            if (message) {
              setError(message);
              return;
            }
            setError(null);
            void onRespond(review.id, response.trim()).catch((err: unknown) => {
              setError(err instanceof Error ? err.message : "Could not save the response.");
            });
          }}
        >
          <label className="block" htmlFor={`response-${review.id}`}>
            <span className="mb-1.5 block text-[0.72rem] font-semibold uppercase tracking-[0.16em] text-gold-700">
              {review.responseBody ? "Edit your response" : "Your response"}
            </span>
            <textarea
              id={`response-${review.id}`}
              value={response}
              maxLength={800}
              onChange={(event) => setResponse(event.target.value)}
              className="min-h-24 w-full max-w-full rounded-2xl border border-forest-800/15 px-4 py-3 text-base"
            />
          </label>
          <Button type="submit" className="min-h-12 w-full" disabled={busy}>
            {review.responseBody ? "Save response" : "Post response"}
          </Button>
        </form>
      )}
      <div className="mt-3">
        {review.reportedByMe ? (
          <p className="text-sm text-ink-700">You reported this review. It stays published until an admin decides.</p>
        ) : (
          <Button type="button" variant="ghost" className="min-h-11" onClick={() => setReporting((open) => !open)}>
            Report
          </Button>
        )}
        {reporting && !review.reportedByMe ? (
          <form
            className="mt-2 space-y-2"
            onSubmit={(event) => {
              event.preventDefault();
              setError(null);
              void onReport(review.id, reason, note).catch((err: unknown) => {
                setError(err instanceof Error ? err.message : "Could not report the review.");
              });
            }}
          >
            <label className="block" htmlFor={`reason-${review.id}`}>
              <span className="mb-1.5 block text-[0.72rem] font-semibold uppercase tracking-[0.16em] text-gold-700">Reason</span>
              <select
                id={`reason-${review.id}`}
                className="min-h-11 w-full rounded-2xl border border-forest-800/15 bg-cream-50 px-3"
                value={reason}
                onChange={(event) => setReason(event.target.value as ReviewReportReason)}
              >
                {REVIEW_REPORT_REASONS.map((item) => (
                  <option key={item} value={item}>
                    {REPORT_REASON_LABELS[item]}
                  </option>
                ))}
              </select>
            </label>
            <label className="block" htmlFor={`note-${review.id}`}>
              <span className="mb-1.5 block text-[0.72rem] font-semibold uppercase tracking-[0.16em] text-gold-700">
                Note, optional
              </span>
              <textarea
                id={`note-${review.id}`}
                value={note}
                maxLength={500}
                onChange={(event) => setNote(event.target.value)}
                className="min-h-20 w-full rounded-2xl border border-forest-800/15 px-3 py-2"
              />
            </label>
            <Button type="submit" variant="outline" className="min-h-11 w-full" disabled={busy}>
              Send report
            </Button>
          </form>
        ) : null}
      </div>
      <FormError message={error} />
    </li>
  );
}

export function ProReviewsPage() {
  const configured = isSupabaseConfigured();
  const [reputation, setReputation] = useState<ContractorReputation | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(configured);
  const [busyId, setBusyId] = useState<string | null>(null);

  function load() {
    setLoading(true);
    setError(null);
    void fetchMyContractorReviews()
      .then((payload) => setReputation(parseContractorReputation(payload)))
      .catch((err: unknown) => setError(err instanceof Error ? err.message : "Could not load your reviews."))
      .finally(() => setLoading(false));
  }

  useEffect(() => {
    if (!configured) return;
    load();
  }, [configured]);

  async function onRespond(reviewId: string, body: string) {
    setBusyId(reviewId);
    try {
      await respondToBookingReview(reviewId, body);
      const payload = await fetchMyContractorReviews();
      setReputation(parseContractorReputation(payload));
    } finally {
      setBusyId(null);
    }
  }

  async function onReport(reviewId: string, reason: ReviewReportReason, note: string) {
    setBusyId(reviewId);
    try {
      await reportBookingReview(reviewId, reason, note);
      const payload = await fetchMyContractorReviews();
      setReputation(parseContractorReputation(payload));
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div className="space-y-6">
      <header>
        <p className="text-[0.72rem] font-semibold uppercase tracking-[0.22em] text-gold-600">Priority Pro</p>
        <h1 className="mt-2 font-display text-4xl font-semibold text-forest-800">Reviews</h1>
        <p className="mt-3 max-w-xl text-ink-700">
          Your rating comes from published homeowner reviews. You can respond once and edit that response, or report a
          review. You cannot change the stars, edit the review, hide it, or mark it verified.
        </p>
      </header>
      {!configured ? <EmptyState title="Marketplace not connected" body="Reviews need Supabase." /> : null}
      {loading ? <LoadingState label="Loading reviews" /> : null}
      {error ? <ErrorState message={error} onRetry={load} /> : null}
      {!loading && !error && reputation ? (
        <ContractorReviewDashboard reputation={reputation} busyId={busyId} onRespond={onRespond} onReport={onReport} />
      ) : null}
    </div>
  );
}
