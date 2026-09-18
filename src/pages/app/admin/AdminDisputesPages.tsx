import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { EmptyState } from "../../../components/layout/DashboardShell";
import { Button } from "../../../components/ui/Button";
import { ConfirmDialog } from "../../../components/ui/ConfirmDialog";
import { FormError } from "../../../lib/auth/AuthCard";
import { useAuth } from "../../../lib/auth/useAuth";
import {
  fetchAdminTrustDispute,
  fetchAdminTrustDisputes,
  resolveAdminTrustDispute,
  type RpcJson,
} from "../../../lib/marketplace/api";
import {
  DISPUTE_CATEGORY_LABELS,
  DISPUTE_RESOLUTIONS,
  DISPUTE_STATUS_LABELS,
  canAdminResolveDispute,
  type DisputeCategory,
  type DisputeResolution,
  type DisputeStatus,
} from "../../../lib/trust/disputes";

export function AdminDisputesPage() {
  const [rows, setRows] = useState<RpcJson[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void fetchAdminTrustDisputes()
      .then(setRows)
      .catch((err: Error) => setError(err.message));
  }, []);

  return (
    <div className="space-y-6">
      <header>
        <p className="text-[0.72rem] font-semibold uppercase tracking-[0.22em] text-gold-600">Admin</p>
        <h1 className="mt-2 font-display text-4xl font-semibold text-forest-800">Disputes</h1>
        <p className="mt-3 max-w-xl text-ink-700">
          Inspect the job, parties, review, and audit before you act. You cannot resolve a dispute you filed or
          unsuspend yourself.
        </p>
      </header>
      <FormError message={error} />
      {rows.length === 0 ? (
        <EmptyState title="No disputes" body="Review and rating-suspension appeals will land here." />
      ) : (
        <ul className="space-y-3">
          {rows.map((row) => (
            <li key={String(row.id)}>
              <Link
                to={`/app/admin/disputes/${String(row.id)}`}
                className="block rounded-3xl border border-forest-800/10 bg-cream-50 px-5 py-4"
              >
                <p className="font-semibold text-forest-800">
                  {DISPUTE_CATEGORY_LABELS[row.category as DisputeCategory] ?? String(row.category)}
                </p>
                <p className="mt-1 text-sm text-ink-500">
                  {DISPUTE_STATUS_LABELS[row.status as DisputeStatus] ?? String(row.status)}
                </p>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export function AdminDisputeDetailPage() {
  const { disputeId = "" } = useParams();
  const { profile, account_type, account_status } = useAuth();
  const [payload, setPayload] = useState<RpcJson | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState("");
  const [pending, setPending] = useState<DisputeResolution | null>(null);
  const [busy, setBusy] = useState(false);

  async function reload() {
    setPayload(await fetchAdminTrustDispute(disputeId));
  }

  useEffect(() => {
    void reload().catch((err: Error) => setError(err.message));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [disputeId]);

  const dispute = (payload?.dispute ?? null) as RpcJson | null;
  const events = (Array.isArray(payload?.events) ? payload?.events : []) as RpcJson[];
  const review = (payload?.review ?? null) as RpcJson | null;
  const booking = (payload?.booking ?? null) as RpcJson | null;

  if (!dispute) return <p className="text-ink-500">{error ?? "Loading…"}</p>;

  function resolve(resolution: DisputeResolution) {
    const blocked = canAdminResolveDispute(
      { id: profile?.id ?? null, accountType: account_type, accountStatus: account_status },
      String(dispute?.filer_id ?? ""),
      dispute?.target_profile_id ? String(dispute.target_profile_id) : null,
    );
    if (blocked) {
      setError(blocked);
      return;
    }
    setBusy(true);
    void resolveAdminTrustDispute(String(dispute?.id), resolution, note)
      .then(() => reload())
      .catch((err: Error) => setError(err.message))
      .finally(() => {
        setBusy(false);
        setPending(null);
      });
  }

  return (
    <div className="space-y-6">
      <header>
        <p className="text-[0.72rem] font-semibold uppercase tracking-[0.22em] text-gold-600">
          {DISPUTE_STATUS_LABELS[dispute.status as DisputeStatus] ?? String(dispute.status)}
        </p>
        <h1 className="mt-2 font-display text-4xl font-semibold text-forest-800">
          {DISPUTE_CATEGORY_LABELS[dispute.category as DisputeCategory] ?? String(dispute.category)}
        </h1>
      </header>
      <FormError message={error} />
      <section className="rounded-3xl border border-forest-800/10 bg-cream-50 px-5 py-4 text-sm">
        <p className="font-semibold text-forest-800">Explanation</p>
        <p className="mt-2 leading-relaxed text-ink-700">{String(dispute.explanation)}</p>
        <p className="mt-3 text-ink-500">Filer {String(dispute.filer_id)}</p>
        {dispute.target_profile_id ? <p className="text-ink-500">Target {String(dispute.target_profile_id)}</p> : null}
      </section>
      {booking ? (
        <section className="rounded-3xl border border-forest-800/10 px-5 py-4 text-sm">
          <p className="font-semibold text-forest-800">Job</p>
          <p className="mt-2">Booking {String(booking.id)} · {String(booking.status)}</p>
          <p>Customer {String(booking.customer_id)}</p>
          <p>Contractor profile {String(booking.contractor_profile_id)}</p>
        </section>
      ) : null}
      {review ? (
        <section className="rounded-3xl border border-forest-800/10 px-5 py-4 text-sm">
          <p className="font-semibold text-forest-800">Review</p>
          <p className="mt-2">
            {String(review.rating)} / 5 · {review.included_in_rating ? "counts toward rating" : "removed from rating"}
          </p>
          <p className="mt-2 leading-relaxed">{review.body ? String(review.body) : "No written comment."}</p>
        </section>
      ) : null}
      <section className="space-y-2">
        <p className="font-semibold text-forest-800">Audit</p>
        <ul className="space-y-2 text-sm">
          {events.map((event) => (
            <li key={String(event.id)} className="rounded-2xl bg-cream-100 px-4 py-3">
              {String(event.event_type)} · {String(event.created_at)}
            </li>
          ))}
        </ul>
      </section>
      {dispute.status === "OPEN" || dispute.status === "UNDER_REVIEW" ? (
        <section className="space-y-3">
          <label className="block">
            <span className="mb-1.5 block text-[0.72rem] font-semibold uppercase tracking-[0.16em] text-gold-700">
              Admin note
            </span>
            <textarea
              className="min-h-24 w-full rounded-2xl border border-forest-800/15 px-4 py-3"
              value={note}
              onChange={(event) => setNote(event.target.value)}
            />
          </label>
          <div className="grid gap-2 sm:grid-cols-2">
            {DISPUTE_RESOLUTIONS.map((resolution) => (
              <Button
                key={resolution}
                type="button"
                variant={resolution === "CLOSE" || resolution === "UPHOLD" ? "outline" : "primary"}
                disabled={busy}
                onClick={() => setPending(resolution)}
              >
                {resolution.replaceAll("_", " ")}
              </Button>
            ))}
          </div>
        </section>
      ) : null}
      <ConfirmDialog
        open={pending !== null}
        title="Resolve this dispute?"
        body="This writes an immutable audit row. You cannot resolve your own dispute or unsuspend yourself."
        confirmLabel="Confirm resolution"
        busy={busy}
        onClose={() => setPending(null)}
        onConfirm={() => {
          if (pending) resolve(pending);
        }}
      />
    </div>
  );
}
