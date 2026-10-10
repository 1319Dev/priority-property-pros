import { useEffect, useState } from "react";
import { EmptyState } from "../../../components/layout/DashboardShell";
import { Button } from "../../../components/ui/Button";
import { ErrorState, LoadingState } from "../../../components/ui/PageState";
import { FormError } from "../../../lib/auth/AuthCard";
import { formatApprovalDate } from "../../../lib/admin/approvals";
import { adminListPortfolioReviewQueue, adminSetPortfolioPrivacy } from "../../../lib/admin/approvalsApi";
import type { PortfolioPrivacyChoice, PortfolioReviewItem } from "../../../lib/admin/portfolioReview";
import { PortfolioPhotoFrame } from "../../../components/marketplace/PortfolioPhotoFrame";
import { signedContractorDocUrl } from "../../../lib/marketplace/api";

type ReviewCard = PortfolioReviewItem & { imageUrl: string | null };

export function PortfolioPhotoReviewList({
  items,
  busyId,
  onApprove,
  onHide,
}: {
  items: ReviewCard[];
  busyId?: string | null;
  onApprove: (id: string) => void;
  onHide: (id: string) => void;
}) {
  if (items.length === 0) {
    return (
      <EmptyState
        title="No photos waiting for review"
        body="New and edited portfolio photos show up here until an admin approves or hides them."
      />
    );
  }

  return (
    <ul className="space-y-4">
      {items.map((item) => {
        const caption = item.title?.trim() || "Portfolio photo";
        const busy = busyId === item.id;
        return (
          <li key={item.id} className="rounded-3xl border border-forest-800/10 bg-cream-50 px-4 py-4 sm:px-5">
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-gold-600">Pending review</p>
            <h2 className="mt-1 font-display text-2xl font-semibold text-forest-800">{item.contractor_label}</h2>
            <p className="mt-1 text-sm text-ink-500">{formatApprovalDate(item.created_at)}</p>
            <PortfolioPhotoFrame
              src={item.imageUrl}
              alt={caption}
              className="mt-3 h-48 w-full rounded-2xl sm:h-56"
            />
            <p className="mt-3 break-words text-sm font-semibold text-forest-800">{caption}</p>
            {item.description?.trim() ? (
              <p className="mt-1 break-words text-sm text-ink-700">{item.description}</p>
            ) : null}
            <div className="mt-4 flex flex-col gap-2 sm:flex-row">
              <Button
                type="button"
                size="sm"
                className="w-full sm:w-auto"
                disabled={busy}
                aria-label={`Approve ${caption}`}
                onClick={() => onApprove(item.id)}
              >
                {busy ? "Working…" : "Approve"}
              </Button>
              <Button
                type="button"
                size="sm"
                variant="gold"
                className="w-full sm:w-auto"
                disabled={busy}
                aria-label={`Hide ${caption}`}
                onClick={() => onHide(item.id)}
              >
                Hide
              </Button>
            </div>
          </li>
        );
      })}
    </ul>
  );
}

export function PortfolioPhotoReviewPanel() {
  const [items, setItems] = useState<ReviewCard[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  function load() {
    setError(null);
    return adminListPortfolioReviewQueue()
      .then(async (rows) => {
        const withImages = await Promise.all(
          rows.map(async (row) => {
            let imageUrl: string | null = null;
            try {
              imageUrl = await signedContractorDocUrl(row.storage_path);
            } catch {
              imageUrl = null;
            }
            return { ...row, imageUrl };
          }),
        );
        setItems(withImages);
      })
      .catch((err: Error) => {
        setItems([]);
        setError(err.message);
      });
  }

  useEffect(() => {
    void load();
  }, []);

  async function decide(id: string, state: PortfolioPrivacyChoice) {
    const previous = items ?? [];
    setItems(previous.filter((item) => item.id !== id));
    setBusyId(id);
    setError(null);
    try {
      await adminSetPortfolioPrivacy(id, state);
    } catch (err) {
      setItems(previous);
      setError(err instanceof Error ? err.message : "Could not update this photo.");
    } finally {
      setBusyId(null);
    }
  }

  const loadFailed = items !== null && items.length === 0 && error !== null;

  return (
    <section className="space-y-4" aria-label="Photo review">
      <div>
        <h2 className="font-display text-3xl font-semibold text-forest-800">Photo review</h2>
        <p className="mt-2 max-w-2xl text-sm text-ink-700">
          Approve publishes the photo to customers. Hide keeps it off the storefront. A new upload or an edited caption
          comes back here for another look.
        </p>
      </div>
      <FormError message={loadFailed ? null : error} />
      {items === null ? <LoadingState label="Loading photos" /> : null}
      {loadFailed ? <ErrorState message={error ?? "Could not load photos."} onRetry={() => void load()} /> : null}
      {items && !loadFailed ? (
        <PortfolioPhotoReviewList
          items={items}
          busyId={busyId}
          onApprove={(id) => void decide(id, "PUBLIC_SAFE")}
          onHide={(id) => void decide(id, "PRIVATE")}
        />
      ) : null}
    </section>
  );
}
