import { useEffect, useState } from "react";
import { Button } from "../../../components/ui/Button";
import { ConfirmDialog } from "../../../components/ui/ConfirmDialog";
import { EmptyState } from "../../../components/layout/DashboardShell";
import { FormError } from "../../../lib/auth/AuthCard";
import { friendlyAdminError } from "../../../lib/admin/friendlyAdminError";
import type { PlatformReview } from "../../../lib/marketplace/platformReviews";
import { adminListPlatformReviews, adminSetPlatformReviewStatus } from "../../../lib/marketplace/platformReviewsApi";
import { isSupabaseConfigured } from "../../../lib/supabase/config";
import { StarRating } from "../../../features/reviews/ReviewCard";

export function AdminReviewsPage() {
  const [rows, setRows] = useState<PlatformReview[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [offline, setOffline] = useState(false);
  const [loaded, setLoaded] = useState(false);

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
        <p className="text-xs font-semibold uppercase tracking-[0.22em] text-gold-600">Admin</p>
        <h1 className="mt-2 font-display text-4xl font-semibold text-forest-800">Platform reviews</h1>
        <p className="mt-3 max-w-xl text-ink-700">
          Signed-in users auto-approve. Reject anything that is spam, contact-leaking, or off-topic. Approve and reject
          both require a reason, and that reason is written to the audit log. These are not Google reviews.
        </p>
      </header>
      <FormError message={error} />
      {!loaded ? null : rows.length === 0 ? (
        <EmptyState title="No platform reviews yet" body="Approved reviews will appear on /reviews and the homepage." />
      ) : (
        <ul className="space-y-3">
          {rows.map((row) => (
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
      <div className="mt-3 flex flex-wrap gap-2">
        <Button
          size="sm"
          variant="outline"
          disabled={busy || !reasonReady || row.status === "APPROVED"}
          onClick={() => setPending("APPROVED")}
        >
          Approve
        </Button>
        <Button
          size="sm"
          variant="ghost"
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
