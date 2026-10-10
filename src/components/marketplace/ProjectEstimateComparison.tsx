import { useEffect, useState } from "react";
import { useToast } from "../../hooks/useToast";
import {
  declineEstimate,
  directoryRowBadges,
  fetchContractorNameForProject,
  fetchEstimateItems,
  fetchProjectEstimates,
  fetchPublicContractor,
  fetchPublicContractorExtras,
  selectEstimate,
} from "../../lib/marketplace/api";
import { SELECT_CONFIRM_BODY, SELECTED_BOOKING_COPY } from "../../lib/marketplace/customerCopy";
import {
  ratingComparisonLabel,
  startComparisonLabel,
  timelineComparisonLabel,
  type ComparisonEstimate,
} from "../../lib/marketplace/estimateComparison";
import {
  canCustomerDeclineFrom,
  canCustomerSelectFrom,
  customerEstimateStatusLabel,
  liveCustomerEstimates,
} from "../../lib/marketplace/estimateLifecycle";
import { genericCredentialBadges } from "../../lib/marketplace/publicDirectory";
import { ESTIMATE_ITEM_KIND_LABELS, type EstimateItemKind, type EstimateStatus, type ProjectStatus } from "../../lib/marketplace/types";
import { estimateNeedsNewSubmission } from "../../lib/marketplace/privacy";
import { EstimateComparison, type ComparisonViewRow } from "./EstimateComparison";
import { FormError } from "../../lib/auth/AuthCard";

export function ProjectEstimateComparison({
  projectId,
  projectStatus,
  selectedEstimateId,
  selectedBookingId,
  onChanged,
}: {
  projectId: string;
  projectStatus: ProjectStatus;
  selectedEstimateId?: string | null;
  selectedBookingId?: string | null;
  onChanged?: () => void;
}) {
  const toast = useToast();
  const [rows, setRows] = useState<ComparisonViewRow[]>([]);
  const [confirmId, setConfirmId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const visible =
    projectStatus === "ESTIMATES_AVAILABLE" || projectStatus === "CONTRACTOR_SELECTED" || rows.length > 0;

  async function load() {
    const estimates = liveCustomerEstimates(await fetchProjectEstimates(projectId)).slice(0, 3);
    const openForChoice = projectStatus !== "CONTRACTOR_SELECTED" && projectStatus !== "CANCELLED";
    const detailed = await Promise.all(
      estimates.map(async (estimate) => {
        const [items, contractor, extras, entitledName] = await Promise.all([
          fetchEstimateItems(estimate.id),
          fetchPublicContractor(estimate.contractor_profile_id),
          fetchPublicContractorExtras(estimate.contractor_profile_id).catch(() => ({
            services: [],
            areas: [],
            badges: [],
            portfolio: [],
          })),
          fetchContractorNameForProject(projectId, estimate.contractor_profile_id).catch(() => null),
        ]);
        const status = estimate.status as EstimateStatus;
        const directoryBadges = contractor ? directoryRowBadges(contractor) : [];
        const badgeSource = extras.badges.length > 0 ? extras.badges : directoryBadges;
        const badges =
          badgeSource.length === 0
            ? []
            : genericCredentialBadges(
                badgeSource.map((badge) => ({
                  kind: String(badge.kind ?? ""),
                  label: String(badge.label ?? ""),
                })),
              ).map((badge) => badge.label);
        const ratingCount = contractor?.rating_count ?? 0;
        const ratingAverage = ratingCount > 0 ? contractor?.rating_average ?? null : null;
        const base: ComparisonEstimate = {
          id: estimate.id,
          businessName: entitledName || contractor?.display_label || "Local pro",
          totalCents: estimate.total_cents,
          lineItems: items.map((item) => ({
            id: item.id,
            label: `${ESTIMATE_ITEM_KIND_LABELS[(item.kind as EstimateItemKind) ?? "CUSTOM"]}: ${item.label}`,
          })),
          timelineLabel: timelineComparisonLabel(estimate.duration_hours),
          timelineHours: estimate.duration_hours,
          startLabel: startComparisonLabel(estimate.available_from),
          startAt: estimate.available_from,
          ratingAverage,
          ratingCount,
          ratingLabel: ratingComparisonLabel(ratingAverage, ratingCount),
          badges,
          submittedAt: estimate.submitted_at,
        };
        const outOfDate = estimateNeedsNewSubmission(status);
        return {
          ...base,
          selectable: canCustomerSelectFrom(status) && openForChoice && !outOfDate,
          declinable: canCustomerDeclineFrom(status) && openForChoice,
          selected: selectedEstimateId === estimate.id,
          outOfDate,
          statusLabel: outOfDate ? "Needs a new estimate" : customerEstimateStatusLabel(status),
        } satisfies ComparisonViewRow;
      }),
    );
    setRows(detailed);
  }

  useEffect(() => {
    let stop = false;
    void load()
      .catch((err: Error) => {
        if (!stop) setError(err.message);
      })
      .finally(() => {
        if (!stop) setLoading(false);
      });
    return () => {
      stop = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId, projectStatus, selectedEstimateId]);

  if (!visible && !loading) return null;
  if (loading) return <p className="text-sm text-ink-500">Loading estimates</p>;

  return (
    <div className="space-y-3">
      <FormError message={error} />
      <EstimateComparison
        rows={rows}
        confirmId={confirmId}
        busy={busy}
        bookingHref={selectedBookingId ? `/app/customer/bookings/${selectedBookingId}` : null}
        selectedCopy={SELECTED_BOOKING_COPY}
        confirmBody={SELECT_CONFIRM_BODY}
        onStartHire={setConfirmId}
        onCancelHire={() => setConfirmId(null)}
        onConfirmHire={(estimateId) => {
          setBusy(true);
          setError(null);
          void selectEstimate(projectId, estimateId)
            .then(() => {
              toast.push("Pro selected.");
              setConfirmId(null);
              onChanged?.();
              return load();
            })
            .catch((err: Error) => setError(err.message))
            .finally(() => setBusy(false));
        }}
        onDecline={(estimateId) => {
          setBusy(true);
          setError(null);
          void declineEstimate(estimateId)
            .then(() => {
              toast.push("Estimate declined.");
              return load();
            })
            .catch((err: Error) => setError(err.message))
            .finally(() => setBusy(false));
        }}
      />
    </div>
  );
}
