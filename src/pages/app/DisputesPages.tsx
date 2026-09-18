import { useEffect, useState, type FormEvent } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { EmptyState } from "../../components/layout/DashboardShell";
import { Button, ButtonLink } from "../../components/ui/Button";
import { TextInput } from "../../components/ui/Input";
import { FormError } from "../../lib/auth/AuthCard";
import { useAuth } from "../../lib/auth/useAuth";
import {
  createTrustDispute,
  fetchMyTrustDispute,
  fetchMyTrustDisputes,
  uploadDisputeEvidence,
  type RpcJson,
} from "../../lib/marketplace/api";
import {
  DISPUTE_CATEGORIES,
  DISPUTE_CATEGORY_LABELS,
  DISPUTE_STATUS_LABELS,
  canCreateDispute,
  disputeRequiresReviewId,
  type DisputeCategory,
  type DisputeStatus,
} from "../../lib/trust/disputes";

function accountDisputesBase(accountType: string | null): string {
  if (accountType === "CONTRACTOR") return "/app/pro/account/disputes";
  if (accountType === "VERIFIER") return "/app/verifier/account/disputes";
  if (accountType === "ADMIN") return "/app/admin/account/disputes";
  return "/app/customer/account/disputes";
}

export function DisputesListPage() {
  const { account_type, account_status } = useAuth();
  const base = accountDisputesBase(account_type);
  const [rows, setRows] = useState<RpcJson[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void fetchMyTrustDisputes()
      .then(setRows)
      .catch((err: Error) => setError(err.message));
  }, []);

  return (
    <div className="space-y-6">
      <header>
        <p className="text-[0.72rem] font-semibold uppercase tracking-[0.22em] text-gold-600">Account</p>
        <h1 className="mt-2 font-display text-4xl font-semibold text-forest-800">Disputes</h1>
        <p className="mt-3 max-w-xl text-ink-700">
          Ask PPP to look at a fraudulent or inaccurate review, or appeal a rating suspension. An admin reviews the
          job, the parties, and the record. You cannot unsuspend yourself.
        </p>
      </header>
      <FormError message={error} />
      {account_status === "SUSPENDED" ? (
        <p className="rounded-3xl bg-gold-500/20 px-5 py-4 text-sm text-forest-950">
          Your account is suspended. File a rating-suspension appeal here. Existing history stays visible.
        </p>
      ) : null}
      <ButtonLink to={`${base}/new`}>File a dispute</ButtonLink>
      {rows.length === 0 ? (
        <EmptyState title="No disputes" body="When you file one, it will stay here with its status." />
      ) : (
        <ul className="space-y-3">
          {rows.map((row) => (
            <li key={String(row.id)}>
              <Link to={`${base}/${String(row.id)}`} className="block rounded-3xl border border-forest-800/10 bg-cream-50 px-5 py-4">
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

export function DisputeNewPage() {
  const { account_type, account_status, user } = useAuth();
  const navigate = useNavigate();
  const base = accountDisputesBase(account_type);
  const [category, setCategory] = useState<DisputeCategory>("INACCURATE_REVIEW");
  const [explanation, setExplanation] = useState("");
  const [reviewId, setReviewId] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    const blocked = canCreateDispute(
      { id: user?.id ?? null, accountType: account_type, accountStatus: account_status },
      { category, explanation, disputedReviewId: reviewId.trim() || null },
    );
    if (blocked) {
      setError(blocked);
      return;
    }
    setBusy(true);
    try {
      let evidencePath: string | null = null;
      if (file && user) {
        evidencePath = await uploadDisputeEvidence(user.id, crypto.randomUUID(), file);
      }
      const result = await createTrustDispute({
        category,
        explanation,
        disputedReviewId: reviewId.trim() || null,
        evidencePath,
      });
      navigate(`${base}/${String(result.dispute_id)}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not file the dispute.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="max-w-lg space-y-6">
      <header>
        <h1 className="font-display text-4xl font-semibold text-forest-800">File a dispute</h1>
        <p className="mt-3 text-ink-700">
          Tell us what is wrong. Optional evidence is stored privately for you and admins.
        </p>
      </header>
      <form className="space-y-4" onSubmit={onSubmit}>
        <label className="block">
          <span className="mb-1.5 block text-[0.72rem] font-semibold uppercase tracking-[0.16em] text-gold-700">
            Category
          </span>
          <select
            className="min-h-12 w-full rounded-2xl border border-forest-800/15 bg-cream-50 px-4"
            value={category}
            onChange={(event) => setCategory(event.target.value as DisputeCategory)}
          >
            {DISPUTE_CATEGORIES.map((item) => (
              <option key={item} value={item}>
                {DISPUTE_CATEGORY_LABELS[item]}
              </option>
            ))}
          </select>
        </label>
        {disputeRequiresReviewId(category) ? (
          <TextInput
            label="Review id"
            value={reviewId}
            onChange={(event) => setReviewId(event.target.value)}
            hint="Copy the review id from the completed job if you have it."
          />
        ) : null}
        <label className="block">
          <span className="mb-1.5 block text-[0.72rem] font-semibold uppercase tracking-[0.16em] text-gold-700">
            Explanation
          </span>
          <textarea
            className="min-h-32 w-full rounded-2xl border border-forest-800/15 px-4 py-3"
            value={explanation}
            onChange={(event) => setExplanation(event.target.value)}
            required
          />
        </label>
        <label className="block text-sm text-ink-700">
          Optional evidence (image or PDF)
          <input
            type="file"
            accept="image/jpeg,image/png,image/webp,application/pdf"
            className="mt-2 block w-full"
            onChange={(event) => setFile(event.target.files?.[0] ?? null)}
          />
        </label>
        <FormError message={error} />
        <Button type="submit" className="min-h-14 w-full" disabled={busy}>
          {busy ? "Sending…" : "Submit dispute"}
        </Button>
      </form>
    </div>
  );
}

export function DisputeDetailPage() {
  const { disputeId = "" } = useParams();
  const { account_type } = useAuth();
  const base = accountDisputesBase(account_type);
  const [row, setRow] = useState<RpcJson | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void fetchMyTrustDispute(disputeId)
      .then(setRow)
      .catch((err: Error) => setError(err.message));
  }, [disputeId]);

  if (!row) return <p className="text-ink-500">{error ?? "Loading…"}</p>;

  return (
    <div className="max-w-lg space-y-6">
      <header>
        <p className="text-[0.72rem] font-semibold uppercase tracking-[0.22em] text-gold-600">
          {DISPUTE_STATUS_LABELS[row.status as DisputeStatus] ?? String(row.status)}
        </p>
        <h1 className="mt-2 font-display text-4xl font-semibold text-forest-800">
          {DISPUTE_CATEGORY_LABELS[row.category as DisputeCategory] ?? String(row.category)}
        </h1>
      </header>
      <FormError message={error} />
      <p className="rounded-3xl bg-cream-50 px-5 py-4 text-sm leading-relaxed text-ink-700">{String(row.explanation)}</p>
      {row.disputed_review_id ? (
        <p className="text-sm text-ink-500">Review {String(row.disputed_review_id)}</p>
      ) : null}
      {row.resolution_note ? (
        <p className="rounded-3xl bg-cream-100 px-5 py-4 text-sm">{String(row.resolution_note)}</p>
      ) : null}
      <ButtonLink to={base} variant="ghost">
        Back to disputes
      </ButtonLink>
    </div>
  );
}
