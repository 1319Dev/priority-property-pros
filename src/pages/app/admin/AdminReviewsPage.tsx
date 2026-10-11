import { useEffect, useState } from "react";
import { Button } from "../../../components/ui/Button";
import { ConfirmDialog } from "../../../components/ui/ConfirmDialog";
import { EmptyState } from "../../../components/layout/DashboardShell";
import { FormError } from "../../../lib/auth/AuthCard";
import { friendlyAdminError } from "../../../lib/admin/friendlyAdminError";
import { PLATFORM_REVIEW_STATUSES, type PlatformReview, type PlatformReviewStatus } from "../../../lib/marketplace/platformReviews";
import { adminListPlatformReviews, adminSetPlatformReviewStatus } from "../../../lib/marketplace/platformReviewsApi";
import { isSupabaseConfigured } from "../../../lib/supabase/config";
import { StarRating } from "../../../features/reviews/ReviewCard";
import { JobReviewModeration } from "./JobReviewModeration";

export function AdminReviewsPage() {
  const [rows, setRows] = useState<PlatformReview[]>([]);
  const [queue, setQueue] = useState<PlatformReviewStatus>("PENDING");
  const [error, setError] = useState<string | null>(null);
  const [offline, setOffline] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [tab, setTab] = useState<"site" | "jobs">("site");

  useEffect(() => {
    let cancelled = false;
    void adminListPlatformReviews()
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
        setError(friendlyAdminError(err instanceof Error ? { message } : null, "Could not load reviews."));
        setLoaded(true);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  if (offline) {
    return <EmptyState title="Marketplace not connected" body="Platform reviews need Supabase." />;
  }

  return (
    <div className="space-y-6">
      <header>
        <p className="text-xs font-semibold uppercase tracking-[0.22em] text-gold-700">Admin</p>
        <h1 className="mt-2 font-display text-4xl font-semibold text-forest-800">Platform reviews</h1>
        <p className="mt-3 max-w-xl text-ink-700">
          New reviews stay pending until you approve them. Only activated accounts can submit. Rejecting requires a
          reason, and that reason is written to the audit log. Do not reject a review only because of its star rating.
          These are not Google reviews.
        </p>
      </header>
      <div role="tablist" aria-label="Review moderation" className="flex flex-col gap-2 sm:flex-row">
        <button
          type="button"
          role="tab"
          aria-selected={tab === "site"}
          className={`min-h-11 w-full rounded-full px-4 text-sm font-semibold sm:w-auto ${tab === "site" ? "bg-forest-800 text-cream-50" : "bg-cream-100 text-forest-800"}`}
          onClick={() => setTab("site")}
        >
          Site reviews
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={tab === "jobs"}
          className={`min-h-11 w-full rounded-full px-4 text-sm font-semibold sm:w-auto ${tab === "jobs" ? "bg-forest-800 text-cream-50" : "bg-cream-100 text-forest-800"}`}
          onClick={() => setTab("jobs")}
        >
          Job reviews
        </button>
      </div>
      {tab === "jobs" ? <JobReviewModeration /> : null}
      {tab !== "site" ? null : (
        <div className="flex flex-col gap-2 sm:flex-row" role="tablist" aria-label="Platform review queue">
          {PLATFORM_REVIEW_STATUSES.map((status) => {
            const count = rows.filter((row) => row.status === status).length;
            const label = status === "PENDING" ? "Pending" : status === "APPROVED" ? "Approved" : "Rejected";
            return (
              <button
                key={status}
                type="button"
                role="tab"
                aria-selected={queue === status}
                className={`min-h-11 w-full rounded-full px-4 text-sm font-semibold sm:w-auto ${
                  queue === status ? "bg-forest-800 text-cream-50" : "border border-forest-800/15 bg-cream-50 text-forest-800"
                }`}
                onClick={() => setQueue(status)}
              >
                {label} ({count})
              </button>
            );
          })}
        </div>
      )}
      {tab === "site" ? <FormError message={error} /> : null}
      {tab !== "site" ? null : !loaded ? null : rows.filter((row) => row.status === queue).length === 0 ? (
        <EmptyState
          title={`No ${queue.toLowerCase()} reviews`}
          body="Approved reviews appear on /reviews and the homepage. Pending reviews stay off the public page."
        />
      ) : (
        <ul className="space-y-3">
          {rows.filter((row) => row.status === queue).map((row) => (
            <ReviewModerationCard
              key={row.id}
              row={row}
              onUpdated={(status) => setRows((current) => current.map((item) => (item.id === row.id ? { ...item, status } : item)))}
              onError={setError}
            />
          ))}
        </ul>
      )}
    </div>
  );
}

function ReviewModerationCard({
  row,
  onUpdated,
  onError,
}: {
  row: PlatformReview;
  onUpdated: (status: PlatformReview["status"]) => void;
  onError: (message: string | null) => void;
}) {
  const [reason, setReason] = useState("");
  const [pending, setPending] = useState<Extract<PlatformReview["status"], "APPROVED" | "REJECTED"> | null>(null);
  const [busy, setBusy] = useState(false);
  const trimmed = reason.trim();
  const reasonReady = trimmed.length >= 3 && trimmed.length <= 500;

  async function commit() {
    if (!pending || !reasonReady) return;
    setBusy(true);
    onError(null);
    try {
      await adminSetPlatformReviewStatus(row.id, pending, trimmed);
      onUpdated(pending);
      setPending(null);
      setReason("");
    } catch (err: unknown) {
      onError(err instanceof Error ? err.message : "Could not update that review.");
      setPending(null);
    } finally {
      setBusy(false);
    }
  }

  return (
    <li className="rounded-3xl border border-forest-800/10 bg-cream-50 px-5 py-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <StarRating rating={row.rating} />
        <p className="text-xs font-semibold uppercase tracking-[0.14em] text-gold-700">{row.status}</p>
      </div>
      <p className="mt-2 text-sm leading-relaxed text-ink-700">{row.body}</p>
      <p className="mt-2 text-sm font-semibold text-forest-800">
        {row.display_name}
        {row.city ? ` · ${row.city}` : ""}
      </p>
      <label className="mt-4 block">
        <span className="mb-1.5 block text-xs font-semibold uppercase tracking-[0.16em] text-gold-700">
          Reason (required)
        </span>
        <textarea
          className="min-h-24 w-full rounded-2xl border border-forest-800/15 px-4 py-3"
          value={reason}
          maxLength={500}
          onChange={(event) => setReason(event.target.value)}
          placeholder="Why this review should be approved or rejected"
        />
      </label>
      <div className="mt-3 flex flex-col gap-2 sm:flex-row">
        <Button
          size="sm"
          variant="outline"
          className="min-h-11 w-full sm:w-auto"
          disabled={busy || !reasonReady || row.status === "APPROVED"}
          onClick={() => setPending("APPROVED")}
        >
          Approve
        </Button>
        <Button
          size="sm"
          variant="ghost"
          className="min-h-11 w-full sm:w-auto"
          disabled={busy || !reasonReady || row.status === "REJECTED"}
          onClick={() => setPending("REJECTED")}
        >
          Reject
        </Button>
      </div>
      <ConfirmDialog
        open={pending != null}
        title={pending === "REJECTED" ? "Reject this review?" : "Approve this review?"}
        body="The reason is stored in the audit log. It is not shown on the public review."
        confirmLabel={pending === "REJECTED" ? "Reject review" : "Approve review"}
        cancelLabel="Keep it"
        tone={pending === "REJECTED" ? "danger" : "primary"}
        busy={busy}
        onConfirm={() => void commit()}
        onClose={() => {
          if (!busy) setPending(null);
        }}
      />
    </li>
  );
}
