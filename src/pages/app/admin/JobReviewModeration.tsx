import { useEffect, useState } from "react";
import { Button } from "../../../components/ui/Button";
import { ConfirmDialog } from "../../../components/ui/ConfirmDialog";
import { EmptyState } from "../../../components/layout/DashboardShell";
import { FormError } from "../../../lib/auth/AuthCard";
import {
  adminHideBookingReview,
  adminHideBookingReviewResponse,
  adminListBookingReviews,
  adminRestoreBookingReview,
  type AdminBookingReview,
} from "../../../lib/admin/bookingReviewModerationApi";
import {
  HIDDEN_REVIEW_NOTE,
  RATING_ONLY_HIDE_NOTE,
  RESPONSE_HIDDEN_NOTE,
  moderationReasonIsRatingOnly,
  moderationReasonReady,
} from "../../../lib/marketplace/bookingReviewModeration";
import { isSupabaseConfigured } from "../../../lib/supabase/config";
import { StarRating } from "../../../features/reviews/ReviewCard";

export function JobReviewModeration() {
  const [rows, setRows] = useState<AdminBookingReview[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [offline, setOffline] = useState(false);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void adminListBookingReviews()
      .then((next) => {
        if (cancelled) return;
        setRows(next);
        setLoaded(true);
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        const message = err instanceof Error ? err.message : "";
        if (!isSupabaseConfigured() || /not configured/i.test(message)) {
          setOffline(true);
          return;
        }
        setError(message || "Could not load job reviews.");
        setLoaded(true);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  if (offline) {
    return <EmptyState title="Marketplace not connected" body="Job review moderation needs Supabase." />;
  }

  return (
    <div className="space-y-4">
      <p className="max-w-xl text-ink-700">
        Hiding removes a review from the public profile and from the rating. The review stays on the job for both parties.
        A low star rating is not a reason to hide a review. Hide a response on its own when the review itself should stay up.
      </p>
      <FormError message={error} />
      {!loaded ? null : rows.length === 0 ? (
        <EmptyState title="No job reviews yet" body="Verified reviews from completed jobs will show up here." />
      ) : (
        <ul className="space-y-3">
          {rows.map((row) => (
            <JobReviewCard
              key={row.id}
              row={row}
              onChange={(next) => setRows((current) => current.map((item) => (item.id === row.id ? next : item)))}
              onError={setError}
            />
          ))}
        </ul>
      )}
    </div>
  );
}

function JobReviewCard({
  row,
  onChange,
  onError,
}: {
  row: AdminBookingReview;
  onChange: (next: AdminBookingReview) => void;
  onError: (message: string | null) => void;
}) {
  const [reason, setReason] = useState("");
  const [pending, setPending] = useState<"hide" | "restore" | "hide-response" | null>(null);
  const [busy, setBusy] = useState(false);
  const trimmed = reason.trim();
  const ratingOnly = trimmed.length >= 20 && moderationReasonIsRatingOnly(trimmed);
  const ready = moderationReasonReady(trimmed);

  async function commit() {
    if (!pending || !ready) return;
    setBusy(true);
    onError(null);
    try {
      if (pending === "hide") {
        await adminHideBookingReview(row.id, trimmed);
        onChange({ ...row, hidden_at: new Date().toISOString(), hidden_reason: trimmed });
      } else if (pending === "restore") {
        await adminRestoreBookingReview(row.id, trimmed);
        onChange({ ...row, hidden_at: null, hidden_reason: null });
      } else {
        await adminHideBookingReviewResponse(row.id, trimmed);
        onChange({
          ...row,
          contractor_response_hidden_at: new Date().toISOString(),
          contractor_response_hidden_reason: trimmed,
        });
      }
      setPending(null);
      setReason("");
    } catch (err: unknown) {
      onError(err instanceof Error ? err.message : "Could not update that review.");
      setPending(null);
    } finally {
      setBusy(false);
    }
  }

  const party = row.reviewer_role === "CUSTOMER" ? "Customer review" : "Contractor review";

  return (
    <li className="min-w-0 rounded-3xl border border-forest-800/10 bg-cream-50 px-5 py-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <StarRating rating={row.rating} />
        <p className="text-xs font-semibold uppercase tracking-[0.14em] text-gold-700">{party}</p>
      </div>
      <p className="mt-2 break-words text-sm leading-relaxed text-ink-700">{row.body?.trim() ? row.body : "No written comment."}</p>
      {row.hidden_at ? <p className="mt-2 text-sm font-semibold text-forest-800">{HIDDEN_REVIEW_NOTE}</p> : null}
      {row.reports.length > 0 ? (
        <ul className="mt-3 space-y-1 text-sm text-ink-700">
          {row.reports.map((report) => (
            <li key={`${report.created_at}:${report.reason}`}>Report: {report.reason}</li>
          ))}
        </ul>
      ) : null}
      {row.contractor_response ? (
        <div className="mt-3 border-t border-forest-800/10 pt-3">
          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-gold-700">Public response</p>
          <p className="mt-1 break-words text-sm text-ink-700">{row.contractor_response}</p>
          {row.contractor_response_hidden_at ? <p className="mt-1 text-sm font-semibold text-forest-800">{RESPONSE_HIDDEN_NOTE}</p> : null}
        </div>
      ) : null}
      <label className="mt-4 block">
        <span className="mb-1.5 block text-xs font-semibold uppercase tracking-[0.16em] text-gold-700">Reason (required)</span>
        <textarea
          aria-label={`Reason for ${row.rating} star ${party}`}
          className="min-h-24 w-full rounded-2xl border border-forest-800/15 px-4 py-3"
          value={reason}
          maxLength={500}
          onChange={(event) => setReason(event.target.value)}
          placeholder="What evidence shows this should change?"
        />
      </label>
      {ratingOnly ? <p className="mt-2 text-sm text-ink-700">{RATING_ONLY_HIDE_NOTE}</p> : null}
      <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:flex-wrap">
        {row.hidden_at ? (
          <Button type="button" size="sm" variant="outline" className="w-full sm:w-auto" disabled={busy || !ready} onClick={() => setPending("restore")}>
            Restore review
          </Button>
        ) : (
          <Button type="button" size="sm" variant="outline" className="w-full sm:w-auto" disabled={busy || !ready} onClick={() => setPending("hide")}>
            Hide review
          </Button>
        )}
        {row.contractor_response && !row.contractor_response_hidden_at ? (
          <Button
            type="button"
            size="sm"
            variant="ghost"
            className="w-full sm:w-auto"
            disabled={busy || !ready}
            onClick={() => setPending("hide-response")}
          >
            Hide response
          </Button>
        ) : null}
      </div>
      <ConfirmDialog
        open={pending != null}
        title={pending === "restore" ? "Restore this review?" : pending === "hide-response" ? "Hide this response?" : "Hide this review?"}
        body={
          pending === "hide-response"
            ? "The review stays on the public profile. Only the response comes down. The reason is stored in the audit log."
            : pending === "restore"
              ? "The review goes back on the public profile and into the rating. The reason is stored in the audit log."
              : "The review leaves the public profile and the rating. It stays on the job for both parties. The reason is stored in the audit log."
        }
        confirmLabel={pending === "restore" ? "Restore review" : pending === "hide-response" ? "Hide response" : "Hide review"}
        cancelLabel="Keep it"
        tone={pending === "restore" ? "primary" : "danger"}
        busy={busy}
        onConfirm={() => void commit()}
        onClose={() => {
          if (!busy) setPending(null);
        }}
      />
    </li>
  );
}
