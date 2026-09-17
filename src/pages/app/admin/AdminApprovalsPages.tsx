import { useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { EmptyState } from "../../../components/layout/DashboardShell";
import { BottomSheet } from "../../../components/ui/BottomSheet";
import { Button, ButtonLink } from "../../../components/ui/Button";
import { ConfirmDialog } from "../../../components/ui/ConfirmDialog";
import { ErrorState, LoadingState } from "../../../components/ui/PageState";
import { FormError } from "../../../lib/auth/AuthCard";
import {
  APPROVAL_TABS,
  approvalContactName,
  approvalStatusLabel,
  filterApprovalQueue,
  formatApprovalDate,
  formatCategoryNames,
  formatServiceAreaSummary,
  onboardingStatusLabel,
  pendingApprovalCount,
  type ApprovalTab,
  type ContractorApprovalItem,
} from "../../../lib/admin/approvals";
import {
  adminApproveContractor,
  adminRejectContractor,
  adminRequestContractorInfo,
  getContractorApproval,
  listContractorApprovals,
} from "../../../lib/admin/approvalsApi";
import { accountStatusLabel } from "../../../lib/marketplace/statusLabels";
import { centsToDollarString } from "../../../lib/marketplace/fees";
import { useToast } from "../../../hooks/useToast";

const TAB_LABELS: Record<ApprovalTab, string> = {
  PENDING: "Pending",
  APPROVED: "Approved",
  REJECTED: "Rejected",
  ALL: "All",
};

function dash(value: string | number | null | undefined): string {
  if (value == null || value === "") return "—";
  return String(value);
}

export function AdminApprovalsPage() {
  const [tab, setTab] = useState<ApprovalTab>("PENDING");
  const [items, setItems] = useState<ContractorApprovalItem[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  function load() {
    setLoading(true);
    setError(null);
    void listContractorApprovals("ALL")
      .then(setItems)
      .catch((err: Error) => setError(err.message))
      .finally(() => setLoading(false));
  }

  useEffect(() => {
    load();
  }, []);

  const filtered = useMemo(() => filterApprovalQueue(items, tab), [items, tab]);
  const counts = useMemo(
    () => ({
      PENDING: pendingApprovalCount(items),
      APPROVED: filterApprovalQueue(items, "APPROVED").length,
      REJECTED: filterApprovalQueue(items, "REJECTED").length,
      ALL: items.length,
    }),
    [items],
  );

  return (
    <div className="space-y-6">
      <header>
        <p className="text-[0.72rem] font-semibold uppercase tracking-[0.22em] text-gold-600">Admin</p>
        <h1 className="mt-2 font-display text-4xl font-semibold text-forest-800">Contractor approvals</h1>
        <p className="mt-3 max-w-2xl text-ink-700">
          Review real applications. Approve and reject only from this queue. Paying a signup fee never approves a
          contractor. Matching still needs an active, approved pro who is accepting work in the right category and area.
        </p>
      </header>
      <FormError message={error} />
      <ApprovalsQueueView
        tab={tab}
        counts={counts}
        items={filtered}
        loading={loading}
        onTabChange={setTab}
        onRetry={load}
      />
    </div>
  );
}

export function ApprovalsQueueView({
  tab,
  counts,
  items,
  loading,
  onTabChange,
  onRetry,
}: {
  tab: ApprovalTab;
  counts: Record<ApprovalTab, number>;
  items: ContractorApprovalItem[];
  loading: boolean;
  onTabChange: (tab: ApprovalTab) => void;
  onRetry?: () => void;
}) {
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2" role="tablist" aria-label="Approval status">
        {APPROVAL_TABS.map((item) => (
          <button
            key={item}
            type="button"
            role="tab"
            aria-selected={tab === item}
            className={`min-h-11 rounded-full px-4 py-2 text-sm font-semibold ${
              tab === item ? "bg-forest-800 text-cream-50" : "bg-cream-100 text-forest-800"
            }`}
            onClick={() => onTabChange(item)}
          >
            {TAB_LABELS[item]} ({counts[item]})
          </button>
        ))}
      </div>
      {loading ? <LoadingState label="Loading approvals" /> : null}
      {!loading && items.length === 0 ? (
        <EmptyState
          title={tab === "PENDING" ? "No pending applications" : "Nothing in this tab"}
          body="Contractor approval_status cannot be self-served. When someone applies, they appear here for an admin to review."
        />
      ) : null}
      {!loading && items.length > 0 ? (
        <ul className="space-y-3">
          {items.map((item) => (
            <li key={item.contractor_profile_id}>
              <ApprovalCard item={item} />
            </li>
          ))}
        </ul>
      ) : null}
      {!loading && onRetry ? (
        <button type="button" className="text-sm font-semibold text-forest-800 underline" onClick={onRetry}>
          Refresh queue
        </button>
      ) : null}
    </div>
  );
}

function ApprovalCard({ item }: { item: ContractorApprovalItem }) {
  return (
    <article className="rounded-3xl border border-forest-800/10 bg-cream-50 px-5 py-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="font-display text-2xl font-semibold text-forest-800">
            {item.business_name.trim() || "Unnamed business"}
          </h2>
          <p className="mt-1 text-sm text-ink-700">{approvalContactName(item)}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <StatusChip label={approvalStatusLabel(item.approval_status)} />
          <StatusChip label={accountStatusLabel(item.account_status)} />
        </div>
      </div>
      <dl className="mt-4 grid gap-2 text-sm sm:grid-cols-2">
        <Field label="Email" value={item.email} />
        <Field label="Phone" value={dash(item.phone)} />
        <Field label="Categories" value={formatCategoryNames(item)} />
        <Field label="Service area" value={formatServiceAreaSummary(item)} />
        <Field label="Date applied" value={formatApprovalDate(item.applied_at)} />
        <Field label="Onboarding" value={onboardingStatusLabel(item.onboarding_status)} />
      </dl>
      <div className="mt-4">
        <ButtonLink to={`/app/admin/approvals/${item.contractor_profile_id}`} size="sm">
          View Contractor
        </ButtonLink>
      </div>
    </article>
  );
}

export function AdminApprovalDetailPage() {
  const { contractorProfileId = "" } = useParams();
  const toast = useToast();
  const [item, setItem] = useState<ContractorApprovalItem | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [confirmApprove, setConfirmApprove] = useState(false);
  const [rejectOpen, setRejectOpen] = useState(false);
  const [infoOpen, setInfoOpen] = useState(false);
  const [rejectReason, setRejectReason] = useState("");
  const [infoMessage, setInfoMessage] = useState("");

  function load() {
    if (!contractorProfileId) return;
    setLoading(true);
    setError(null);
    void getContractorApproval(contractorProfileId)
      .then(setItem)
      .catch((err: Error) => setError(err.message))
      .finally(() => setLoading(false));
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- reload when the route id changes
  }, [contractorProfileId]);

  async function run(action: () => Promise<ContractorApprovalItem>, success: string) {
    setBusy(true);
    setError(null);
    try {
      const next = await action();
      setItem(next);
      toast.push(success);
      setConfirmApprove(false);
      setRejectOpen(false);
      setInfoOpen(false);
      setRejectReason("");
      setInfoMessage("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "That action failed.");
    } finally {
      setBusy(false);
    }
  }

  if (loading) return <LoadingState label="Loading contractor" />;
  if (!item) {
    return (
      <div className="space-y-4">
        <Link to="/app/admin/approvals" className="text-sm font-semibold text-forest-800 underline">
          Back to approvals
        </Link>
        <ErrorState message={error || "Contractor application not found."} onRetry={load} />
      </div>
    );
  }

  const pending = item.approval_status === "PENDING";

  return (
    <div className="space-y-6">
      <Link to="/app/admin/approvals" className="text-sm font-semibold text-forest-800 underline">
        Back to approvals
      </Link>
      <ApprovalDetailView
        item={item}
        error={error}
        busy={busy}
        onApprove={() => setConfirmApprove(true)}
        onReject={() => setRejectOpen(true)}
        onRequestInfo={() => setInfoOpen(true)}
      />
      <ConfirmDialog
        open={confirmApprove}
        title="Approve this contractor?"
        body="This sets approval_status to APPROVED and account_status to ACTIVE. They can match jobs when they are accepting work in a matching category and area. Paying never auto-approves — only this action does."
        confirmLabel="Approve contractor"
        cancelLabel="Keep pending"
        tone="primary"
        busy={busy}
        onConfirm={() => {
          void run(() => adminApproveContractor(item.contractor_profile_id), "Contractor approved.");
        }}
        onClose={() => setConfirmApprove(false)}
      />
      <BottomSheet open={rejectOpen} title="Reject this application?" onClose={() => setRejectOpen(false)}>
        <p className="text-sm text-ink-700">
          The account stays in the database. They will not receive opportunities. This cannot be done by the contractor.
        </p>
        <label className="mt-4 block">
          <span className="mb-1.5 block text-[0.72rem] font-semibold uppercase tracking-[0.16em] text-gold-700">
            Reason (optional)
          </span>
          <textarea
            className="min-h-28 w-full rounded-2xl border border-forest-800/15 px-4 py-3"
            value={rejectReason}
            onChange={(e) => setRejectReason(e.target.value)}
          />
        </label>
        <div className="mt-4 flex flex-col gap-2">
          <Button
            type="button"
            variant="outline"
            className="min-h-14 w-full"
            disabled={busy}
            onClick={() => {
              void run(
                () => adminRejectContractor(item.contractor_profile_id, rejectReason),
                "Contractor rejected. The account was not deleted.",
              );
            }}
          >
            {busy ? "Working…" : "Reject application"}
          </Button>
          <Button type="button" variant="ghost" className="min-h-12 w-full" disabled={busy} onClick={() => setRejectOpen(false)}>
            Keep it
          </Button>
        </div>
      </BottomSheet>
      <BottomSheet open={infoOpen} title="Request more information" onClose={() => setInfoOpen(false)}>
        <p className="text-sm text-ink-700">
          The application stays pending. Your message is stored for this contractor and written to the audit log.
        </p>
        <label className="mt-4 block">
          <span className="mb-1.5 block text-[0.72rem] font-semibold uppercase tracking-[0.16em] text-gold-700">
            Message
          </span>
          <textarea
            className="min-h-28 w-full rounded-2xl border border-forest-800/15 px-4 py-3"
            value={infoMessage}
            onChange={(e) => setInfoMessage(e.target.value)}
          />
        </label>
        <div className="mt-4 flex flex-col gap-2">
          <Button
            type="button"
            className="min-h-14 w-full"
            disabled={busy || !infoMessage.trim() || !pending}
            onClick={() => {
              void run(
                () => adminRequestContractorInfo(item.contractor_profile_id, infoMessage),
                "More information requested.",
              );
            }}
          >
            {busy ? "Working…" : "Send request"}
          </Button>
          <Button type="button" variant="ghost" className="min-h-12 w-full" disabled={busy} onClick={() => setInfoOpen(false)}>
            Cancel
          </Button>
        </div>
      </BottomSheet>
      {item.approval_status === "APPROVED" ? (
        <p className="text-sm text-ink-500">Approved contractors can be reviewed here. Matching still requires availability and area.</p>
      ) : null}
      {item.approval_status === "REJECTED" ? (
        <Button type="button" variant="outline" disabled={busy} onClick={() => setConfirmApprove(true)}>
          Approve anyway
        </Button>
      ) : null}
    </div>
  );
}

export function ApprovalDetailView({
  item,
  error,
  busy,
  onApprove,
  onReject,
  onRequestInfo,
}: {
  item: ContractorApprovalItem;
  error?: string | null;
  busy?: boolean;
  onApprove?: () => void;
  onReject?: () => void;
  onRequestInfo?: () => void;
}) {
  const pending = item.approval_status === "PENDING";
  const credentials = item.credentials ?? [];

  return (
    <div className="space-y-6">
      <header>
        <p className="text-[0.72rem] font-semibold uppercase tracking-[0.22em] text-gold-600">Contractor</p>
        <h1 className="mt-2 font-display text-4xl font-semibold text-forest-800">
          {item.business_name.trim() || "Unnamed business"}
        </h1>
        <p className="mt-2 text-ink-700">{approvalContactName(item)}</p>
        <div className="mt-3 flex flex-wrap gap-2">
          <StatusChip label={approvalStatusLabel(item.approval_status)} />
          <StatusChip label={accountStatusLabel(item.account_status)} />
          <StatusChip label={onboardingStatusLabel(item.onboarding_status)} />
        </div>
      </header>
      <FormError message={error ?? null} />
      <section className="rounded-3xl border border-forest-800/10 bg-cream-50 px-5 py-4">
        <h2 className="font-display text-2xl font-semibold text-forest-800">Application</h2>
        <dl className="mt-4 grid gap-3 text-sm sm:grid-cols-2">
          <Field label="Email" value={item.email} />
          <Field label="Phone" value={dash(item.phone)} />
          <Field label="Categories" value={formatCategoryNames(item)} />
          <Field label="Service area" value={formatServiceAreaSummary(item)} />
          <Field label="Date applied" value={formatApprovalDate(item.applied_at)} />
          <Field label="Accepting work" value={item.accepting_work ? "Yes" : "No"} />
          <Field label="Primary trade" value={dash(item.primary_trade)} />
          <Field label="Years experience" value={dash(item.years_experience)} />
          <Field label="Headline" value={dash(item.headline)} />
          <Field label="Website" value={dash(item.website_url)} />
          <Field
            label="Job size"
            value={
              item.min_job_cents == null && item.max_job_cents == null
                ? "Not provided"
                : `$${centsToDollarString(item.min_job_cents) || "0"} – $${centsToDollarString(item.max_job_cents) || "0"}`
            }
          />
          <Field label="Approved at" value={formatApprovalDate(item.approved_at)} />
        </dl>
        {item.bio ? <p className="mt-4 text-sm leading-relaxed text-ink-700">{item.bio}</p> : null}
      </section>
      <section className="rounded-3xl border border-forest-800/10 bg-cream-50 px-5 py-4">
        <h2 className="font-display text-2xl font-semibold text-forest-800">Verification fields</h2>
        <dl className="mt-4 grid gap-3 text-sm sm:grid-cols-2">
          <Field label="License number" value={dash(item.license_number)} />
          <Field label="Insurance carrier" value={dash(item.insurance_carrier)} />
        </dl>
        {credentials.length === 0 ? (
          <p className="mt-3 text-sm text-ink-500">No credential documents uploaded.</p>
        ) : (
          <ul className="mt-3 space-y-2">
            {credentials.map((cred) => (
              <li key={cred.id} className="rounded-2xl bg-cream-100 px-4 py-3 text-sm">
                <p className="font-semibold text-forest-800">
                  {cred.label} · {cred.kind}
                </p>
                <p className="text-ink-700">
                  {cred.status.replaceAll("_", " ")}
                  {cred.expires_at ? ` · expires ${formatApprovalDate(cred.expires_at)}` : ""}
                </p>
              </li>
            ))}
          </ul>
        )}
      </section>
      {item.info_request_message ? (
        <section className="rounded-3xl border border-gold-500/40 bg-gold-500/10 px-5 py-4">
          <h2 className="font-display text-2xl font-semibold text-forest-800">More information requested</h2>
          <p className="mt-2 text-sm text-ink-700">{item.info_request_message}</p>
          <p className="mt-2 text-xs uppercase tracking-[0.16em] text-gold-700">
            {formatApprovalDate(item.info_requested_at)} · stays pending
          </p>
        </section>
      ) : null}
      {item.approval_status === "REJECTED" ? (
        <section className="rounded-3xl border border-danger-600/20 bg-cream-50 px-5 py-4">
          <h2 className="font-display text-2xl font-semibold text-forest-800">Rejected</h2>
          <p className="mt-2 text-sm text-ink-700">{item.rejection_reason || "No reason recorded."}</p>
          <p className="mt-2 text-xs uppercase tracking-[0.16em] text-gold-700">
            {formatApprovalDate(item.rejected_at)} · account not deleted
          </p>
        </section>
      ) : null}
      <div className="flex flex-col gap-2 sm:flex-row">
        <Button type="button" className="min-h-14" disabled={busy} onClick={onApprove}>
          Approve
        </Button>
        <Button type="button" variant="outline" className="min-h-14" disabled={busy} onClick={onReject}>
          Reject
        </Button>
        <Button type="button" variant="ghost" className="min-h-14" disabled={busy || !pending} onClick={onRequestInfo}>
          Request More Information
        </Button>
      </div>
    </div>
  );
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-[0.72rem] font-semibold uppercase tracking-[0.16em] text-gold-700">{label}</dt>
      <dd className="mt-1 text-ink-900">{value}</dd>
    </div>
  );
}

function StatusChip({ label }: { label: string }) {
  return (
    <span className="inline-flex min-h-8 items-center rounded-full bg-forest-800/8 px-3 text-[0.72rem] font-semibold uppercase tracking-[0.14em] text-forest-800">
      {label}
    </span>
  );
}
