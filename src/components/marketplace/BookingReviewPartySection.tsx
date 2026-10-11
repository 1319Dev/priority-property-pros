import { useState } from "react";
import { Button } from "../ui/Button";
import { FormError } from "../../lib/auth/AuthCard";
import {
  HIDDEN_REVIEW_NOTE,
  REPORT_RECEIVED_NOTE,
  RESPONSE_HIDDEN_NOTE,
  bookingReviewResponseError,
  reportReasonReady,
} from "../../lib/marketplace/bookingReviewModeration";
import type { BookingReview } from "../../lib/marketplace/types";
import type { HiredParty } from "../../lib/marketplace/hired";
import { StarRating } from "../../features/reviews/ReviewCard";

export function BookingReviewPartySection({
  role,
  reviews,
  onReport,
  onRespond,
}: {
  role: HiredParty;
  reviews: BookingReview[];
  onReport: (reviewId: string, reason: string) => Promise<void>;
  onRespond: (reviewId: string, body: string) => Promise<void>;
}) {
  const otherRole = role === "customer" ? "CONTRACTOR" : "CUSTOMER";
  const other = reviews.find((review) => review.reviewer_role === otherRole);
  const ownCustomerReview = role === "customer" ? reviews.find((review) => review.reviewer_role === "CUSTOMER") : null;
  if (!other && !ownCustomerReview?.contractor_response) return null;

  return (
    <div className="space-y-3">
      {other ? (
        <OtherPartyReview
          role={role}
          review={other}
          onReport={onReport}
          onRespond={role === "contractor" ? onRespond : undefined}
        />
      ) : null}
      {ownCustomerReview?.contractor_response ? <ResponseReadout review={ownCustomerReview} /> : null}
    </div>
  );
}

function OtherPartyReview({
  role,
  review,
  onReport,
  onRespond,
}: {
  role: HiredParty;
  review: BookingReview;
  onReport: (reviewId: string, reason: string) => Promise<void>;
  onRespond?: (reviewId: string, body: string) => Promise<void>;
}) {
  const [reason, setReason] = useState("");
  const [reporting, setReporting] = useState(false);
  const [reported, setReported] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const title = role === "customer" ? "This pro's review" : "This homeowner's review";

  async function report() {
    if (!reportReasonReady(reason)) return;
    setReporting(true);
    setError(null);
    try {
      await onReport(review.id, reason.trim());
      setReported(true);
      setReason("");
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Could not send that report.");
    } finally {
      setReporting(false);
    }
  }

  return (
    <section className="min-w-0 space-y-3 rounded-3xl border border-forest-800/10 bg-cream-50 px-5 py-4" aria-label={title}>
      <h2 className="font-display text-2xl text-forest-800">{title}</h2>
      <StarRating rating={review.rating} />
      <p className="break-words text-sm leading-relaxed text-ink-700">{review.body?.trim() ? review.body : "No written comment."}</p>
      {review.hidden_at ? <p className="text-sm font-semibold text-forest-800">{HIDDEN_REVIEW_NOTE}</p> : null}
      {reported ? <p className="text-sm text-ink-700">{REPORT_RECEIVED_NOTE}</p> : null}
      <FormError message={error} />
      {reported ? null : (
        <div className="space-y-2">
          <label className="block">
            <span className="mb-1.5 block text-xs font-semibold uppercase tracking-[0.16em] text-gold-700">Report reason</span>
            <textarea
              aria-label="Report reason"
              className="min-h-24 w-full rounded-2xl border border-forest-800/15 px-4 py-3"
              maxLength={200}
              value={reason}
              onChange={(event) => setReason(event.target.value)}
            />
          </label>
          <Button
            type="button"
            variant="outline"
            className="min-h-11 w-full sm:w-auto"
            disabled={reporting || !reportReasonReady(reason)}
            onClick={() => void report()}
          >
            Report review
          </Button>
        </div>
      )}
      {onRespond ? <ContractorResponseForm review={review} onRespond={onRespond} /> : null}
    </section>
  );
}

function ResponseReadout({ review }: { review: BookingReview }) {
  return (
    <section className="min-w-0 rounded-3xl border border-forest-800/10 bg-cream-50 px-5 py-4" aria-label="Pro response">
      <h2 className="font-display text-2xl text-forest-800">Pro response</h2>
      <p className="mt-2 break-words text-sm leading-relaxed text-ink-700">{review.contractor_response}</p>
      {review.contractor_response_hidden_at ? <p className="mt-2 text-sm font-semibold text-forest-800">{RESPONSE_HIDDEN_NOTE}</p> : null}
    </section>
  );
}

function ContractorResponseForm({
  review,
  onRespond,
}: {
  review: BookingReview;
  onRespond: (reviewId: string, body: string) => Promise<void>;
}) {
  const [body, setBody] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  if (review.contractor_response) {
    return (
      <div className="min-w-0 border-t border-forest-800/10 pt-3">
        <h3 className="font-display text-xl text-forest-800">Your public response</h3>
        <p className="mt-2 break-words text-sm leading-relaxed text-ink-700">{review.contractor_response}</p>
        {review.contractor_response_hidden_at ? <p className="mt-2 text-sm font-semibold text-forest-800">{RESPONSE_HIDDEN_NOTE}</p> : null}
      </div>
    );
  }

  async function submit() {
    const problem = bookingReviewResponseError(body);
    if (problem) {
      setError(problem);
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await onRespond(review.id, body.trim());
      setBody("");
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Could not post that response.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="min-w-0 space-y-2 border-t border-forest-800/10 pt-3">
      <h3 className="font-display text-xl text-forest-800">Public response</h3>
      <p className="text-sm text-ink-700">One response. It is shown on your public profile with this review. No phone number, email, or link.</p>
      <label className="block">
        <span className="mb-1.5 block text-xs font-semibold uppercase tracking-[0.16em] text-gold-700">Your response</span>
        <textarea
          aria-label="Your response"
          className="min-h-28 w-full rounded-2xl border border-forest-800/15 px-4 py-3"
          maxLength={500}
          value={body}
          onChange={(event) => setBody(event.target.value)}
        />
      </label>
      <FormError message={error} />
      <Button type="button" className="min-h-11 w-full sm:w-auto" disabled={busy} onClick={() => void submit()}>
        Post public response
      </Button>
    </div>
  );
}
