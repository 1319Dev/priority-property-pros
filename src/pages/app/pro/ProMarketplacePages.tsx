import { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { EmptyState } from "../../../components/layout/DashboardShell";
import { Button, ButtonLink } from "../../../components/ui/Button";
import { TextInput } from "../../../components/ui/Input";
import { ErrorState, LoadingState } from "../../../components/ui/PageState";
import { HumanStatus, StatusBanner } from "../../../components/ui/StatusBanner";
import { FormError } from "../../../lib/auth/AuthCard";
import { displayName } from "../../../lib/auth/roles";
import { PRE_HIRE_CONTACT_HINT } from "../../../lib/marketplace/antiCircumvention";
import { useAuth } from "../../../lib/auth/useAuth";
import {
  acceptOpportunity,
  addCredential,
  addEstimateItem,
  addPortfolioItem,
  askEstimateQuestion,
  deleteEstimateItem,
  fetchContractorAreas,
  fetchContractorProfileByUser,
  fetchContractorServices,
  fetchCredentials,
  fetchEstimateItems,
  fetchEstimateQuestions,
  fetchOrCreateEstimate,
  fetchOpportunity,
  fetchMyOpportunities,
  fetchPortfolio,
  fetchProjectConnectionAvailability,
  fetchConnectionFeeCheckoutFlags,
  fetchMyProjectConnections,
  startConnectionCheckout,
  fetchProjectNotices,
  fetchProjectAnswers,
  fetchProjectPhotos,
  fetchServiceCategories,
  fetchServiceQuestions,
  passOpportunity,
  requestProjectConnection,
  setContractorServices,
  signedProjectPhotoUrl,
  submitContentReport,
  submitEstimate,
  TIMING_LABELS,
  updateContractorProfile,
  updateCredential,
  updateEstimateDetails,
  uploadContractorDoc,
  upsertContractorArea,
  withdrawEstimate,
  type OpportunityRow,
} from "../../../lib/marketplace/api";
import { centsToDollarString, dollarsToCents, formatUsdFromCents } from "../../../lib/marketplace/fees";
import { ESTIMATE_ITEM_KIND_LABELS, ESTIMATE_ITEM_KINDS, type EstimateItemKind, type EstimateStatus, type ServiceAreaMode, type ServiceCategory } from "../../../lib/marketplace/types";
import { OPPORTUNITY_STATUS_LABELS, opportunityNextActions } from "../../../lib/marketplace/statusLabels";
import { paymentsComingSoonCopy } from "../../../lib/marketplace/bookings";
import {
  CONNECT_PAYMENTS_OFF_COPY,
  CONNECT_REDIRECTING_COPY,
  connectionAvailabilityCopy,
  contractorConnectionUiState,
} from "../../../lib/marketplace/connectionLifecycle";
import { ConnectConfirmDialog } from "../../../components/marketplace/ConnectConfirm";
import { ContractorConnectionCta } from "../../../components/marketplace/ContractorConnectionCta";
import { canWithdrawFrom, WITHDRAW_ESTIMATE_BODY, WITHDRAW_ESTIMATE_CONFIRM, WITHDRAW_ESTIMATE_TITLE } from "../../../lib/marketplace/estimateLifecycle";
import { PHOTO_OCR_RISK_NOTE, PHOTO_REPORT_LABEL } from "../../../lib/marketplace/photoSafety";
import { ConfirmDialog } from "../../../components/ui/ConfirmDialog";
import { useToast } from "../../../hooks/useToast";
import { PRO_DASHBOARD_PRICING_NOTE } from "../../../data/pricing";
import { ProNotificationsList } from "./ProEstimatesPages";

export function ProHomePage() {
  const { profile } = useAuth();
  const name = profile ? displayName(profile.first_name, profile.last_name, profile.email) : "Pro";
  return (
    <div className="space-y-6">
      <header>
        <p className="text-[0.72rem] font-semibold uppercase tracking-[0.22em] text-gold-600">Priority Pro</p>
        <h1 className="mt-2 font-display text-4xl font-semibold text-forest-800">{name}</h1>
        <p className="mt-3 max-w-xl text-ink-700">
          Respond to nearby jobs and track estimates. You cannot approve or verify yourself. Browse anonymized
          opportunities first. Pay $4.99 only when you choose to connect — that does not guarantee a hire.
          Exact address unlocks only after a paid connection entitlement or an admin unlock. Submitting an estimate
          is never charged.
          {` ${PRO_DASHBOARD_PRICING_NOTE}`}
        </p>
      </header>
      <div className="flex flex-wrap gap-3">
        <ButtonLink to="/app/pro/profile">Manage Profile</ButtonLink>
        <ButtonLink to="/app/pro/estimates" variant="outline">
          My Estimates
        </ButtonLink>
        <ButtonLink to="/app/pro/opportunities" variant="outline">
          Opportunities
        </ButtonLink>
      </div>
      <ProNotificationsList />
    </div>
  );
}

export function ProOnboardingPage() {
  const { user } = useAuth();
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [contractorId, setContractorId] = useState<string | null>(null);
  const [businessName, setBusinessName] = useState("");
  const [headline, setHeadline] = useState("");
  const [bio, setBio] = useState("");
  const [years, setYears] = useState("");
  const [accepting, setAccepting] = useState(true);
  const [minJob, setMinJob] = useState("");
  const [maxJob, setMaxJob] = useState("");
  const [categories, setCategories] = useState<ServiceCategory[]>([]);
  const [selected, setSelected] = useState<string[]>([]);
  const [zips, setZips] = useState("");
  const [centerZip, setCenterZip] = useState("");
  const [radius, setRadius] = useState("");
  const [mode, setMode] = useState<ServiceAreaMode>("ZIPS");
  const [areaId, setAreaId] = useState<string | undefined>();
  const [onboardingStatus, setOnboardingStatus] = useState<string>("NOT_STARTED");
  const [credLabel, setCredLabel] = useState("");
  const [credKind, setCredKind] = useState("LICENSE");
  const toast = useToast();

  useEffect(() => {
    if (!user) return;
    const userId = user.id;
    async function load() {
      const [profileRow, cats] = await Promise.all([
        fetchContractorProfileByUser(userId),
        fetchServiceCategories(),
      ]);
      setCategories(cats);
      if (!profileRow) throw new Error("Contractor profile missing.");
      setContractorId(profileRow.id);
      setOnboardingStatus(profileRow.onboarding_status);
      setBusinessName(profileRow.business_name);
      setHeadline(profileRow.headline ?? "");
      setBio(profileRow.bio ?? "");
      setYears(profileRow.years_experience?.toString() ?? "");
      setAccepting(profileRow.accepting_work);
      setMinJob(centsToDollarString(profileRow.min_job_cents));
      setMaxJob(centsToDollarString(profileRow.max_job_cents));
      const services = await fetchContractorServices(profileRow.id);
      setSelected(services.map((s) => s.category_id));
      const areas = await fetchContractorAreas(profileRow.id);
      const area = areas[0];
      if (area) {
        setAreaId(area.id);
        setMode(area.mode);
        setZips((area.zip_codes ?? []).join(", "));
        setCenterZip(area.center_zip ?? "");
        setRadius(area.radius_miles?.toString() ?? "");
      }
    }
    void load().catch((err: Error) => setError(err.message));
  }, [user]);

  async function save() {
    if (!contractorId) return;
    setBusy(true);
    setError(null);
    try {
      await updateContractorProfile(contractorId, {
        business_name: businessName,
        headline,
        bio,
        years_experience: years ? Number(years) : null,
        accepting_work: accepting,
        min_job_cents: dollarsToCents(minJob),
        max_job_cents: dollarsToCents(maxJob),
        ...(onboardingStatus === "COMPLETE" ? {} : { onboarding_status: "SUBMITTED" as const }),
      });
      await setContractorServices(contractorId, selected);
      await upsertContractorArea({
        id: areaId,
        contractor_profile_id: contractorId,
        mode,
        zip_codes: zips
          .split(/[\s,]+/)
          .map((z) => z.trim())
          .filter(Boolean),
        center_zip: centerZip || null,
        radius_miles: radius ? Number(radius) : null,
        label: "Primary area",
      });
      toast.push("Onboarding saved. An admin still has to approve you before matching.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Save failed.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mx-auto max-w-xl space-y-6">
      <h1 className="font-display text-4xl font-semibold text-forest-800">Contractor onboarding</h1>
      <p className="text-sm text-ink-700">
        Customers see an anonymized public card (trade and general area). Business name, logos, license numbers, and
        contact stay private until a homeowner hires you through Priority Property Pros.
        {` ${PRO_DASHBOARD_PRICING_NOTE}`}
      </p>
      <FormError message={error} />
      <TextInput label="Business name" value={businessName} onChange={(e) => setBusinessName(e.target.value)} />
      <TextInput
        label="Headline"
        hint={PRE_HIRE_CONTACT_HINT}
        value={headline}
        onChange={(e) => setHeadline(e.target.value)}
      />
      <label className="block">
        <span className="mb-1.5 block text-[0.72rem] font-semibold uppercase tracking-[0.16em] text-gold-700">Bio</span>
        <textarea className="w-full rounded-2xl border border-forest-800/15 px-4 py-3" rows={4} value={bio} onChange={(e) => setBio(e.target.value)} />
        <span className="mt-1.5 block text-sm text-ink-500">{PRE_HIRE_CONTACT_HINT}</span>
      </label>
      <TextInput label="Years experience" inputMode="numeric" value={years} onChange={(e) => setYears(e.target.value)} />
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" checked={accepting} onChange={(e) => setAccepting(e.target.checked)} />
        Accepting work
      </label>
      <TextInput label="Min job size (USD)" value={minJob} onChange={(e) => setMinJob(e.target.value)} />
      <TextInput label="Max job size (USD)" value={maxJob} onChange={(e) => setMaxJob(e.target.value)} />
      <fieldset>
        <legend className="mb-2 text-[0.72rem] font-semibold uppercase tracking-[0.16em] text-gold-700">Services</legend>
        <div className="grid gap-2">
          {categories.map((cat) => (
            <label key={cat.id} className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={selected.includes(cat.id)}
                onChange={(e) =>
                  setSelected((current) =>
                    e.target.checked ? [...current, cat.id] : current.filter((id) => id !== cat.id),
                  )
                }
              />
              {cat.name}
            </label>
          ))}
        </div>
      </fieldset>
      <fieldset className="space-y-3">
        <legend className="text-[0.72rem] font-semibold uppercase tracking-[0.16em] text-gold-700">Service area</legend>
        <select className="min-h-14 w-full rounded-2xl border border-forest-800/15 px-4" value={mode} onChange={(e) => setMode(e.target.value as ServiceAreaMode)}>
          <option value="ZIPS">ZIP list</option>
          <option value="RADIUS">Radius from a center ZIP</option>
          <option value="ZIPS_AND_RADIUS">ZIPs and radius</option>
        </select>
        <TextInput label="ZIPs (comma separated)" value={zips} onChange={(e) => setZips(e.target.value)} />
        <TextInput label="Center ZIP" value={centerZip} onChange={(e) => setCenterZip(e.target.value)} />
        <TextInput label="Radius (miles)" value={radius} onChange={(e) => setRadius(e.target.value)} />
      </fieldset>
      <div className="space-y-3 rounded-3xl border border-forest-800/10 p-4">
        <h2 className="font-semibold">Credentials</h2>
        <TextInput label="Credential label" value={credLabel} onChange={(e) => setCredLabel(e.target.value)} />
        <select className="min-h-12 w-full rounded-2xl border px-3" value={credKind} onChange={(e) => setCredKind(e.target.value)}>
          <option value="LICENSE">License</option>
          <option value="INSURANCE">Insurance</option>
          <option value="OTHER">Other</option>
        </select>
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={!contractorId || !credLabel}
          onClick={() => {
            if (!contractorId) return;
            void addCredential({
              contractor_profile_id: contractorId,
              kind: credKind,
              label: credLabel,
              status: "NOT_SUBMITTED",
            })
              .then(() => setCredLabel(""))
              .catch((err: Error) => setError(err.message));
          }}
        >
          Add credential
        </Button>
        {contractorId ? <CredentialList contractorId={contractorId} userId={user?.id ?? ""} onError={setError} /> : null}
      </div>
      {contractorId && user ? <PortfolioBlock contractorId={contractorId} userId={user.id} onError={setError} /> : null}
      <Button type="button" disabled={busy} onClick={() => void save()}>
        {busy ? "Saving…" : "Save onboarding"}
      </Button>
    </div>
  );
}

function CredentialList({
  contractorId,
  userId,
  onError,
}: {
  contractorId: string;
  userId: string;
  onError: (message: string) => void;
}) {
  const [rows, setRows] = useState<Awaited<ReturnType<typeof fetchCredentials>>>([]);
  useEffect(() => {
    void fetchCredentials(contractorId).then(setRows).catch((err: Error) => onError(err.message));
  }, [contractorId, onError]);
  return (
    <ul className="space-y-2 text-sm">
      {rows.map((row) => (
        <li key={row.id} className="rounded-2xl bg-cream-100 px-3 py-2">
          {row.label} · {row.kind} · {row.status}
          <input
            className="mt-2 block"
            type="file"
            accept="image/jpeg,image/png,image/webp,application/pdf"
            onChange={(event) => {
              const file = event.target.files?.[0];
              event.target.value = "";
              if (!file) return;
              void uploadContractorDoc({ userId, folder: "credentials", file })
                .then((path) => updateCredential(row.id, { document_path: path, status: "PENDING" }))
                .then(() => fetchCredentials(contractorId))
                .then(setRows)
                .catch((err: Error) => onError(err.message));
            }}
          />
        </li>
      ))}
    </ul>
  );
}

function PortfolioBlock({
  contractorId,
  userId,
  onError,
}: {
  contractorId: string;
  userId: string;
  onError: (message: string) => void;
}) {
  const [rows, setRows] = useState<Awaited<ReturnType<typeof fetchPortfolio>>>([]);
  useEffect(() => {
    void fetchPortfolio(contractorId).then(setRows).catch((err: Error) => onError(err.message));
  }, [contractorId, onError]);
  return (
    <div className="space-y-2">
      <h2 className="font-semibold">Portfolio</h2>
      <input
        type="file"
        accept="image/jpeg,image/png,image/webp"
        aria-label="Add portfolio photo"
        onChange={(event) => {
          const file = event.target.files?.[0];
          event.target.value = "";
          if (!file) return;
          void uploadContractorDoc({ userId, folder: "portfolio", file })
            .then((path) => addPortfolioItem({ contractor_profile_id: contractorId, title: file.name, storage_path: path }))
            .then(() => fetchPortfolio(contractorId))
            .then(setRows)
            .catch((err: Error) => onError(err.message));
        }}
      />
      <p className="text-sm text-ink-500">{rows.length} photo(s)</p>
    </div>
  );
}

export function OpportunitiesPage() {
  const { user } = useAuth();
  const [rows, setRows] = useState<OpportunityRow[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!user) return;
    void fetchContractorProfileByUser(user.id)
      .then((profile) => {
        if (!profile) throw new Error("Contractor profile missing.");
        return fetchMyOpportunities(profile.id);
      })
      .then(setRows)
      .catch((err: Error) => setError(err.message));
  }, [user]);

  const active = rows.filter((row) => row.status === "AVAILABLE" || row.status === "ACCEPTED");
  const history = rows.filter((row) => row.status !== "AVAILABLE" && row.status !== "ACCEPTED");
  const live = active.filter((row) => row.projects?.status !== "CANCELLED");
  const cancelledParticipated = active.filter((row) => row.projects?.status === "CANCELLED").concat(
    history.filter((row) => row.projects?.status === "CANCELLED" || row.status === "CLOSED"),
  );

  return (
    <div className="space-y-6">
      <h1 className="font-display text-4xl font-semibold text-forest-800">Jobs</h1>
      <p className="text-sm text-ink-700">
        Approximate location only. Exact street stays hidden until a paid $4.99 connection entitlement (payments coming
        soon) or an admin unlock. Browse first — connecting is voluntary.
      </p>
      <FormError message={error} />
      {live.length === 0 ? (
        <EmptyState title="No open jobs" body="Nearby matching jobs will land here. You can browse anonymized opportunities at no charge. At most three paid connections per project. Cancelled jobs leave this list." />
      ) : (
        <ul className="space-y-3">
          {live.map((row) => {
            const actions = opportunityNextActions({
              opportunityId: row.id,
              status: row.status,
              projectStatus: row.projects?.status ?? "POSTED",
            });
            return (
              <li key={row.id} className="rounded-3xl border border-forest-800/10 px-5 py-4">
                <HumanStatus label={OPPORTUNITY_STATUS_LABELS[row.status]} />
                <p className="mt-2 font-semibold text-forest-800">{row.projects?.title ?? "Project"}</p>
                <p className="text-sm text-ink-500">
                  {[row.projects?.city, row.projects?.state, row.projects?.zip_code].filter(Boolean).join(", ")}
                </p>
                <Link to={actions[0]?.to ?? `/app/pro/opportunities/${row.id}`} className="mt-3 inline-flex min-h-12 items-center font-semibold text-forest-800">
                  {actions[0]?.label ?? "View opportunity"}
                </Link>
              </li>
            );
          })}
        </ul>
      )}
      {cancelledParticipated.length > 0 ? (
        <section className="space-y-3">
          <h2 className="font-display text-2xl text-forest-800">History</h2>
          <ul className="space-y-3">
            {cancelledParticipated.slice(0, 8).map((row) => (
              <li key={row.id}>
                <Link to={`/app/pro/opportunities/${row.id}`} className="block rounded-3xl border border-forest-800/10 px-5 py-4">
                  <HumanStatus label={row.projects?.status === "CANCELLED" ? "Cancelled" : OPPORTUNITY_STATUS_LABELS[row.status]} />
                  <p className="mt-2 font-semibold text-forest-800">{row.projects?.title ?? "Project"}</p>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  );
}

export function OpportunityDetailPage() {
  const { opportunityId = "" } = useParams();
  const navigate = useNavigate();
  const toast = useToast();
  const { user } = useAuth();
  const [row, setRow] = useState<OpportunityRow | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [photos, setPhotos] = useState<{ url?: string; id: string }[]>([]);
  const [answers, setAnswers] = useState<Awaited<ReturnType<typeof fetchProjectAnswers>>>([]);
  const [questions, setQuestions] = useState<Awaited<ReturnType<typeof fetchServiceQuestions>>>([]);
  const [qa, setQa] = useState<Awaited<ReturnType<typeof fetchEstimateQuestions>>>([]);
  const [notices, setNotices] = useState<Awaited<ReturnType<typeof fetchProjectNotices>>>([]);
  const [availability, setAvailability] = useState<Awaited<ReturnType<typeof fetchProjectConnectionAvailability>> | null>(
    null,
  );
  const [myConnection, setMyConnection] = useState<Awaited<ReturnType<typeof fetchMyProjectConnections>>[number] | null>(
    null,
  );
  const [prompt, setPrompt] = useState("");
  const [busy, setBusy] = useState(false);
  const [connectOpen, setConnectOpen] = useState(false);

  async function reload() {
    const opp = await fetchOpportunity(opportunityId);
    setRow(opp);
    const [photoRows, projectAnswers, spots, mine] = await Promise.all([
      fetchProjectPhotos(opp.project_id),
      fetchProjectAnswers(opp.project_id),
      fetchProjectConnectionAvailability(opp.project_id).catch(() => null),
      fetchMyProjectConnections(opp.project_id).catch(() => []),
    ]);
    setAvailability(spots);
    setMyConnection(mine[0] ?? null);
    setAnswers(projectAnswers);
    if (opp.projects?.category_id) setQuestions(await fetchServiceQuestions(opp.projects.category_id));
    setQa(await fetchEstimateQuestions(opp.project_id, opp.id));
    setNotices(await fetchProjectNotices(opp.project_id).catch(() => []));
    setPhotos(
      await Promise.all(
        photoRows.map(async (photo) => ({
          id: photo.id,
          url: (await signedProjectPhotoUrl(photo.storage_path)) ?? undefined,
        })),
      ),
    );
  }

  useEffect(() => {
    void reload().catch((err: Error) => setError(err.message));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [opportunityId]);

  if (!row) return error ? <ErrorState message={error} /> : <LoadingState label="Loading job" />;
  const project = row.projects;
  const cancelled = project?.status === "CANCELLED";
  const spotsLabel = availability
    ? connectionAvailabilityCopy(availability.remaining, {
        accepting: availability.accepting_connections,
        max: availability.max,
      })
    : "3 connection spots available";
  const connectionUiState = contractorConnectionUiState({
    cancelled,
    accepting: availability?.accepting_connections,
    remaining: availability?.remaining ?? 3,
    myConnectionStatus: myConnection?.status ?? null,
    reservedUntil: myConnection?.reserved_until ?? null,
  });
  const showConnectionCta = !cancelled && (row.status === "AVAILABLE" || row.status === "ACCEPTED");

  return (
    <div className="space-y-6">
      <HumanStatus label={cancelled ? "Cancelled" : OPPORTUNITY_STATUS_LABELS[row.status]} />
      <h1 className="font-display text-4xl font-semibold text-forest-800">{project?.title}</h1>
      <FormError message={error} />
      {cancelled ? (
        <StatusBanner tone="warning" title="This project was cancelled" body="It is no longer an active opportunity. Your estimate history is kept if you already participated." />
      ) : null}
      {notices.map((notice) => (
        <StatusBanner key={notice.id} title={notice.title} body={notice.body} tone={notice.kind.includes("SCOPE") ? "warning" : "info"} />
      ))}
      <section className="rounded-3xl border border-forest-800/10 px-5 py-4 text-sm">
        <p>{project?.description}</p>
        <p className="mt-2 font-semibold">Approximate location</p>
        <p>{[project?.city, project?.state].filter(Boolean).join(", ")}</p>
        <p className="text-ink-500">
          Exact street, phone, email, name, and precise coordinates stay hidden until a paid $4.99 connection
          entitlement or an admin unlock. Clicking Connect does not unlock contact while payments are off.
        </p>
        <p className="mt-2">{project?.timing ? TIMING_LABELS[project.timing] : ""}</p>
        {project?.budget_min_cents != null || project?.budget_max_cents != null ? (
          <p className="mt-2">
            Rough budget{" "}
            {project.budget_min_cents != null ? formatUsdFromCents(project.budget_min_cents) : "open"} –{" "}
            {project.budget_max_cents != null ? formatUsdFromCents(project.budget_max_cents) : "open"}
          </p>
        ) : null}
        <p className="mt-3 font-semibold text-forest-800">{spotsLabel}</p>
      </section>
      <div className="grid grid-cols-2 gap-2">
        {photos.map((photo) => (
          <figure key={photo.id} className="space-y-1">
            <img src={photo.url} alt="" className="h-28 w-full rounded-2xl object-cover" />
            <button
              type="button"
              className="text-xs font-semibold text-forest-800"
              onClick={() => {
                void submitContentReport({
                  targetType: "project_photo",
                  targetId: photo.id,
                  reason: "Unsafe photo before connection",
                })
                  .then(() => toast.push("Report received. A moderator can review this photo."))
                  .catch((err: Error) => setError(err.message));
              }}
            >
              {PHOTO_REPORT_LABEL}
            </button>
          </figure>
        ))}
      </div>
      <p className="text-xs text-ink-500">{PHOTO_OCR_RISK_NOTE}</p>
      <ul className="space-y-2 text-sm">
        {answers.map((answer) => {
          const question = questions.find((q) => q.id === answer.question_id);
          return (
            <li key={answer.id}>
              <strong>{question?.prompt}:</strong> {answer.answer_text}
            </li>
          );
        })}
      </ul>
      {showConnectionCta ? (
        <ContractorConnectionCta state={connectionUiState} busy={busy} onConnect={() => setConnectOpen(true)} />
      ) : null}
      {row.status === "AVAILABLE" && !cancelled ? (
        <div className="flex gap-3">
          <Button
            type="button"
            variant="outline"
            className="min-h-14 flex-1"
            disabled={busy}
            onClick={() => {
              setBusy(true);
              void acceptOpportunity(row.id)
                .then(() => {
                  toast.push("You are participating. Submitting an estimate is never charged.");
                  return reload();
                })
                .catch((err: Error) => setError(err.message))
                .finally(() => setBusy(false));
            }}
          >
            Participate
          </Button>
          <Button
            type="button"
            variant="ghost"
            className="min-h-14 flex-1"
            disabled={busy}
            onClick={() => {
              setBusy(true);
              void passOpportunity(row.id)
                .then(() => navigate("/app/pro/opportunities"))
                .catch((err: Error) => setError(err.message))
                .finally(() => setBusy(false));
            }}
          >
            Pass
          </Button>
        </div>
      ) : null}
      {row.status === "ACCEPTED" && !cancelled ? (
        <section className="space-y-3">
          <h2 className="font-display text-2xl">Ask the customer</h2>
          {qa.map((item) => (
            <div key={item.id} className="rounded-2xl bg-cream-100 px-3 py-2 text-sm">
              <p>{item.prompt}</p>
              <p className="text-ink-500">{item.answer_text ?? "Waiting for an answer"}</p>
            </div>
          ))}
          <textarea className="w-full rounded-2xl border px-3 py-2" value={prompt} onChange={(e) => setPrompt(e.target.value)} />
          <Button
            type="button"
            size="sm"
            onClick={() => {
              if (!user) return;
              void fetchContractorProfileByUser(user.id)
                .then((profile) => {
                  if (!profile) throw new Error("Missing contractor profile");
                  return askEstimateQuestion({
                    project_id: row.project_id,
                    opportunity_id: row.id,
                    asked_by_contractor_profile_id: profile.id,
                    prompt,
                  });
                })
                .then(() => {
                  setPrompt("");
                  return reload();
                })
                .catch((err: Error) => setError(err.message));
            }}
          >
            Send question
          </Button>
          <ButtonLink to={`/app/pro/opportunities/${row.id}/estimate`}>Build estimate</ButtonLink>
        </section>
      ) : null}
      <ConnectConfirmDialog
        open={connectOpen}
        busy={busy}
        onClose={() => setConnectOpen(false)}
        onConfirm={() => {
          setBusy(true);
          void fetchConnectionFeeCheckoutFlags()
            .then((flags) => {
              if (flags.enabled) {
                return startConnectionCheckout({
                  projectId: row.project_id,
                  opportunityId: row.id,
                }).then((result) => {
                  const url = typeof result.checkout_url === "string" ? result.checkout_url : "";
                  if (url) {
                    toast.push(CONNECT_REDIRECTING_COPY);
                    window.location.assign(url);
                    return;
                  }
                  throw new Error(String(result.error ?? result.message ?? "Checkout is not available."));
                });
              }
              return requestProjectConnection(row.project_id).then(() => {
                toast.push(CONNECT_PAYMENTS_OFF_COPY);
                setConnectOpen(false);
                return reload();
              });
            })
            .catch((err: Error) => setError(err.message))
            .finally(() => setBusy(false));
        }}
      />
    </div>
  );
}

export function EstimateBuilderPage() {
  const { opportunityId = "" } = useParams();
  const toast = useToast();
  const { user } = useAuth();
  const [error, setError] = useState<string | null>(null);
  const [estimateId, setEstimateId] = useState<string | null>(null);
  const [status, setStatus] = useState<EstimateStatus>("DRAFT");
  const [withdrawOpen, setWithdrawOpen] = useState(false);
  const [notes, setNotes] = useState("");
  const [duration, setDuration] = useState("");
  const [availableFrom, setAvailableFrom] = useState("");
  const [validUntil, setValidUntil] = useState("");
  const [items, setItems] = useState<Awaited<ReturnType<typeof fetchEstimateItems>>>([]);
  const [kind, setKind] = useState<EstimateItemKind>("LABOR");
  const [label, setLabel] = useState("");
  const [qty, setQty] = useState("1");
  const [unitLabel, setUnitLabel] = useState("hours");
  const [unit, setUnit] = useState("");
  const [totalCents, setTotalCents] = useState(0);

  async function load() {
    if (!user) return;
    const opp = await fetchOpportunity(opportunityId);
    const profile = await fetchContractorProfileByUser(user.id);
    if (!profile) throw new Error("Missing contractor profile");
    const estimate = await fetchOrCreateEstimate({
      projectId: opp.project_id,
      opportunityId: opp.id,
      contractorProfileId: profile.id,
    });
    setEstimateId(estimate.id);
    setStatus(estimate.status as EstimateStatus);
    setNotes(estimate.notes ?? "");
    setDuration(estimate.duration_hours != null ? String(estimate.duration_hours) : "");
    setAvailableFrom(estimate.available_from ?? "");
    setValidUntil(estimate.valid_until ?? "");
    const lineItems = await fetchEstimateItems(estimate.id);
    setItems(lineItems);
    setTotalCents(lineItems.reduce((sum, item) => sum + item.line_total_cents, 0));
  }

  function saveDetails(patch: {
    notes?: string;
    duration_hours?: number | null;
    available_from?: string | null;
    valid_until?: string | null;
  }) {
    if (!estimateId) return;
    void updateEstimateDetails(estimateId, patch).catch((err: Error) => setError(err.message));
  }

  useEffect(() => {
    void load().catch((err: Error) => setError(err.message));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [opportunityId, user]);

  return (
    <div className="mx-auto max-w-xl space-y-6">
      <h1 className="font-display text-4xl font-semibold text-forest-800">Estimate</h1>
      <p className="text-sm text-ink-700">
        Line totals are computed for you. Submitting an estimate is never charged. PPP does not take a percentage of
        the job. {paymentsComingSoonCopy()}
      </p>
      <FormError message={error} />
      <ul className="space-y-2">
        {items.map((item) => (
          <li key={item.id} className="flex items-center justify-between gap-3 rounded-2xl bg-cream-100 px-3 py-2 text-sm">
            <span>
              {ESTIMATE_ITEM_KIND_LABELS[(item.kind as EstimateItemKind) ?? "CUSTOM"]}: {item.label} · {item.quantity}{" "}
              {item.unit_label || "each"} × {formatUsdFromCents(item.unit_cents)} = {formatUsdFromCents(item.line_total_cents)}
            </span>
            <button
              type="button"
              className="min-h-11 shrink-0 font-semibold text-danger-600"
              onClick={() => void deleteEstimateItem(item.id).then(load).catch((err: Error) => setError(err.message))}
            >
              Remove
            </button>
          </li>
        ))}
      </ul>
      <label className="block">
        <span className="mb-1.5 block text-[0.72rem] font-semibold uppercase tracking-[0.16em] text-gold-700">
          Line type
        </span>
        <select
          className="min-h-14 w-full rounded-2xl border border-forest-800/15 bg-cream-50 px-4"
          value={kind}
          onChange={(e) => setKind(e.target.value as EstimateItemKind)}
        >
          {ESTIMATE_ITEM_KINDS.map((itemKind) => (
            <option key={itemKind} value={itemKind}>
              {ESTIMATE_ITEM_KIND_LABELS[itemKind]}
            </option>
          ))}
        </select>
      </label>
      <TextInput label="Line item" value={label} onChange={(e) => setLabel(e.target.value)} />
      <TextInput label="Quantity" inputMode="decimal" value={qty} onChange={(e) => setQty(e.target.value)} />
      <TextInput
        label="Unit"
        hint="hours, each, sq ft, and so on"
        value={unitLabel}
        onChange={(e) => setUnitLabel(e.target.value)}
      />
      <TextInput label="Unit price (USD)" inputMode="decimal" value={unit} onChange={(e) => setUnit(e.target.value)} />
      <Button
        type="button"
        variant="outline"
        className="min-h-14 w-full"
        disabled={!estimateId}
        onClick={() => {
          const unitCents = dollarsToCents(unit);
          if (!estimateId || !label || unitCents == null) return;
          void addEstimateItem({
            estimate_id: estimateId,
            label,
            quantity: Number(qty) || 1,
            unit_cents: unitCents,
            kind,
            unit_label: unitLabel || "each",
            sort_order: items.length,
          })
            .then(() => {
              setLabel("");
              setUnit("");
              return load();
            })
            .catch((err: Error) => setError(err.message));
        }}
      >
        Add line
      </Button>
      <div className="rounded-3xl border border-forest-800/10 px-4 py-3 text-sm">
        <p>Total {formatUsdFromCents(totalCents)}</p>
        <p className="text-ink-500">No PPP percentage is taken from this estimate. Connection is a separate $4.99 choice.</p>
      </div>
      <TextInput
        label="Duration (hours)"
        inputMode="decimal"
        value={duration}
        onChange={(e) => setDuration(e.target.value)}
        onBlur={() => saveDetails({ duration_hours: duration ? Number(duration) : null })}
      />
      <TextInput
        label="Available from"
        type="date"
        value={availableFrom}
        onChange={(e) => setAvailableFrom(e.target.value)}
        onBlur={() => saveDetails({ available_from: availableFrom || null })}
      />
      <TextInput
        label="Estimate expires"
        type="date"
        value={validUntil}
        onChange={(e) => setValidUntil(e.target.value)}
        onBlur={() => saveDetails({ valid_until: validUntil || null })}
      />
      <label className="block">
        <span className="mb-1.5 block text-[0.72rem] font-semibold uppercase tracking-[0.16em] text-gold-700">Notes</span>
        <textarea
          className="w-full rounded-2xl border border-forest-800/15 bg-cream-50 px-4 py-3"
          rows={3}
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          onBlur={() => saveDetails({ notes })}
        />
        <span className="mt-1.5 block text-sm text-ink-500">{PRE_HIRE_CONTACT_HINT}</span>
      </label>
      <div className="sticky bottom-24 z-20 flex gap-3 bg-cream-50/95 py-3 pb-safe lg:bottom-4">
        <Button
          type="button"
          className="min-h-14 flex-1"
          onClick={() => {
            if (!estimateId) return;
            void submitEstimate(estimateId)
              .then((result) => {
                toast.push("Estimate submitted. Nothing was charged.");
                setStatus((String(result.status ?? "SENT") as EstimateStatus) || "SENT");
                return load();
              })
              .catch((err: Error) => setError(err.message));
          }}
        >
          Submit estimate
        </Button>
        {canWithdrawFrom(status) ? (
          <Button
            type="button"
            variant="outline"
            className="min-h-14 flex-1"
            onClick={() => setWithdrawOpen(true)}
          >
            Withdraw Estimate
          </Button>
        ) : null}
      </div>
      <ConfirmDialog
        open={withdrawOpen}
        title={WITHDRAW_ESTIMATE_TITLE}
        body={WITHDRAW_ESTIMATE_BODY}
        confirmLabel={WITHDRAW_ESTIMATE_CONFIRM}
        cancelLabel="Keep estimate"
        onClose={() => setWithdrawOpen(false)}
        onConfirm={() => {
          if (!estimateId) return;
          void withdrawEstimate(estimateId)
            .then(() => {
              toast.push("Estimate withdrawn. History was kept.");
              setWithdrawOpen(false);
              return load();
            })
            .catch((err: Error) => setError(err.message));
        }}
      />
    </div>
  );
}

export function ProJobsPage() {
  return <OpportunitiesPage />;
}

export function ProMessagesPage() {
  return (
    <EmptyState
      title="No messages"
      body="Full messaging is not built yet. Use questions on an accepted job to ask the customer about the work."
    />
  );
}
