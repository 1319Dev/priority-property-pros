import { useEffect, useState } from "react";
import { Button } from "../../../components/ui/Button";
import { EmptyState } from "../../../components/layout/DashboardShell";
import { FormError } from "../../../lib/auth/AuthCard";
import type { PlatformReview } from "../../../lib/marketplace/platformReviews";
import { adminListPlatformReviews, adminSetPlatformReviewStatus } from "../../../lib/marketplace/platformReviewsApi";
import { isSupabaseConfigured } from "../../../lib/supabase/config";
import { StarRating } from "../../../features/reviews/ReviewCard";

export function AdminReviewsPage() {
  const configured = isSupabaseConfigured();
  const [rows, setRows] = useState<PlatformReview[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  useEffect(() => {
    if (!configured) return;
    let cancelled = false;
    void adminListPlatformReviews()
      .then((rows) => {
        if (!cancelled) setRows(rows);
      })
      .catch((err: unknown) => {
        if (!cancelled) setError(err instanceof Error ? err.message : "Could not load reviews.");
      });
    return () => {
      cancelled = true;
    };
  }, [configured]);

  async function setStatus(id: string, status: PlatformReview["status"]) {
    setBusyId(id);
    setError(null);
    try {
      await adminSetPlatformReviewStatus(id, status);
      setRows((current) => current.map((row) => (row.id === id ? { ...row, status } : row)));
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Could not update that review.");
    } finally {
      setBusyId(null);
    }
  }

  if (!configured) {
    return <EmptyState title="Marketplace not connected" body="Platform reviews need Supabase." />;
  }

  return (
    <div className="space-y-6">
      <header>
        <p className="text-[0.72rem] font-semibold uppercase tracking-[0.22em] text-gold-600">Admin</p>
        <h1 className="mt-2 font-display text-4xl font-semibold text-forest-800">Platform reviews</h1>
        <p className="mt-3 max-w-xl text-ink-700">
          Signed-in users auto-approve. Reject anything that is spam, contact-leaking, or off-topic. These are not
          Google reviews.
        </p>
      </header>
      <FormError message={error} />
      {rows.length === 0 ? (
        <EmptyState title="No platform reviews yet" body="Approved reviews will appear on /reviews and the homepage." />
      ) : (
        <ul className="space-y-3">
          {rows.map((row) => (
            <li key={row.id} className="rounded-3xl border border-forest-800/10 bg-cream-50 px-5 py-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <StarRating rating={row.rating} />
                <p className="text-xs font-semibold uppercase tracking-[0.14em] text-gold-700">{row.status}</p>
              </div>
              <p className="mt-2 text-sm leading-relaxed text-ink-700">{row.body}</p>
              <p className="mt-2 text-sm font-semibold text-forest-800">
                {row.display_name}
                {row.city ? ` · ${row.city}` : ""}
              </p>
              <div className="mt-3 flex flex-wrap gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  disabled={busyId === row.id || row.status === "APPROVED"}
                  onClick={() => void setStatus(row.id, "APPROVED")}
                >
                  Approve
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  disabled={busyId === row.id || row.status === "REJECTED"}
                  onClick={() => void setStatus(row.id, "REJECTED")}
                >
                  Reject
                </Button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
