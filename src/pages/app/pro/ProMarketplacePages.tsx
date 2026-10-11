import { useEffect, useState } from "react";
import { Link, useNavigate, useParams, useSearchParams } from "react-router-dom";
import { EmptyState } from "../../../components/layout/DashboardShell";
import { PortfolioExample } from "../../../components/media/PortfolioExample";
import { PortfolioPhotoEditor } from "../../../components/marketplace/PortfolioPhotoEditor";
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
  deletePortfolioItem,
  fetchPortfolioEditorRows,
  updatePortfolioItem,
  askEstimateQuestion,
  confirmBookingHired,
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
  fetchMyBookings,
  fetchProjectBooking,
  fetchProjectConnectionAvailability,
  fetchConnectionFeeCheckoutFlags,
  fetchMyProjectConnections,
  startConnectionCheckout,
  fetchProjectNotices,
  fetchProjectSummaries,
  fetchProjectAnswers,
  fetchProjectPhotos,
  fetchServiceCategories,
  fetchServiceQuestions,
  endContractorJob,
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
  deleteEstimate,
  type OpportunityRow,
} from "../../../lib/marketplace/api";
import { JobReference } from "../../../components/marketplace/JobReference";
import { opportunityListTitle } from "../../../lib/marketplace/opportunityAttach";
import { centsToDollarString, dollarsToCents, formatUsdFromCents } from "../../../lib/marketplace/fees";
import { ServiceRadiusEditor } from "../../../components/marketplace/ServiceRadiusEditor";
import { prepareServiceAreaSave, previewServiceRadius } from "../../../lib/marketplace/serviceAreaApi";
import { contractorAreaSummary } from "../../../lib/marketplace/serviceRadius";
import { ESTIMATE_ITEM_KIND_LABELS, ESTIMATE_ITEM_KINDS, type Booking, type EstimateItemKind, type EstimateStatus, type ServiceCategory } from "../../../lib/marketplace/types";
import { OPPORTUNITY_STATUS_LABELS } from "../../../lib/marketplace/statusLabels";
import { paymentsComingSoonCopy } from "../../../lib/marketplace/bookings";
import {
  CONNECT_PAYMENTS_OFF_COPY,
  CONNECT_REDIRECTING_COPY,
  JOBS_STREET_HELPER_COPY,
  OPPORTUNITY_CONTACT_LOCKED_COPY,
  connectionAvailabilityCopy,
  contractorConnectionUiState,
} from "../../../lib/marketplace/connectionLifecycle";
import { ConnectConfirmDialog } from "../../../components/marketplace/ConnectConfirm";
import { ContractorConnectionCta } from "../../../components/marketplace/ContractorConnectionCta";
import { EndJobDialog } from "../../../components/marketplace/EndJobDialog";
import { HiredConfirmationCard } from "../../../components/marketplace/HiredConfirmation";
import {
  CONNECT_SINGLE_STEP_COPY,
  declineJobButtonLabel,
  declineJobToast,
  canContractorEndJob,
  friendlyEndJobError,
  opportunityAllowsConnectCta,
  runContractorConnect,
} from "../../../lib/marketplace/contractorJobActions";
import {
  canSubmitFrom,
  contractorEstimateDestructiveAction,
  contractorEstimateStatusLabel,
  DELETE_ESTIMATE_BODY,
  DELETE_ESTIMATE_CONFIRM,
  DELETE_ESTIMATE_LABEL,
  DELETE_ESTIMATE_SUCCESS,
  DELETE_ESTIMATE_TITLE,
  WITHDRAW_ESTIMATE_BODY,
  WITHDRAW_ESTIMATE_CONFIRM,
  WITHDRAW_ESTIMATE_LABEL,
  WITHDRAW_ESTIMATE_TITLE,
} from "../../../lib/marketplace/estimateLifecycle";
import { PHOTO_OCR_RISK_NOTE, PHOTO_REPORT_LABEL } from "../../../lib/marketplace/photoSafety";
import { ConfirmDialog } from "../../../components/ui/ConfirmDialog";
import { useToast } from "../../../hooks/useToast";
import { HISTORY_JOBS_COPY, hiredProjectIdSet } from "../../../lib/marketplace/contractorPolish";
import { friendlyNotFound, isQueryableId } from "../../../lib/marketplace/recordId";
import { ProNotificationsList } from "./ProEstimatesPages";
import { HiredJobsPanel } from "../../../components/marketplace/HiredJobsPanel";
import { hiredJobChip } from "../../../lib/marketplace/hiredJobs";
import { InboxHomeCards } from "../../../components/marketplace/InboxHomeCards";

export function ProHomePage() {
  const { profile } = useAuth();
  const name = profile ? displayName(profile.first_name, profile.last_name, profile.email) : "Pro";
  return (
    <div className="space-y-6">
      <header>
        <p className="text-xs font-semibold uppercase tracking-[0.22em] text-gold-600">Priority Pro</p>
        <h1 className="mt-2 font-display text-4xl font-semibold text-forest-800">{name}</h1>
      </header>
      <HiredJobsPanel />
      <p className="max-w-xl text-ink-700">
        Respond to nearby jobs and track your estimates. Browsing is free until you choose to connect.
      </p>
      <div className="flex flex-wrap gap-3">
        <ButtonLink to="/app/pro/profile">Manage Profile</ButtonLink>
        <ButtonLink to="/app/pro/estimates" variant="outline">
          My Estimates
        </ButtonLink>
        <ButtonLink to="/app/pro/opportunities?tab=open" variant="outline">
          Open jobs
        </ButtonLink>
      </div>
      <InboxHomeCards role="contractor" />
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
  const [areaLabel, setAreaLabel] = useState<string | null>(null);
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
        setZips((area.zip_codes ?? []).join(", "));
        setCenterZip(area.center_zip ?? "");
        setRadius(area.radius_miles?.toString() ?? "");
        setAreaLabel(area.label);
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
      const area = await prepareServiceAreaSave({ centerZip, radiusMiles: radius, extraZips: zips });
      await upsertContractorArea({
        id: areaId,
        contractor_profile_id: contractorId,
        ...area,
      });
      setAreaLabel(area.label);
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
        <span className="mb-1.5 block text-xs font-semibold uppercase tracking-[0.16em] text-gold-700">Bio</span>
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
        <legend className="mb-2 text-xs font-semibold uppercase tracking-[0.16em] text-gold-700">Services</legend>
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
      <ServiceRadiusEditor
        centerZip={centerZip}
        radiusMiles={radius}
        extraZips={zips}
        onCenterZipChange={setCenterZip}
        onRadiusMilesChange={setRadius}
        onExtraZipsChange={setZips}
        loadPreview={previewServiceRadius}
      />
      <p className="text-sm text-ink-500">
        {contractorAreaSummary({
          label: areaLabel,
          radiusMiles: radius ? Number(radius) : null,
          centerZip,
          extraZips: zips.split(/[\s,]+/).filter(Boolean),
        })}
      </p>
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
  const [rows, setRows] = useState<Awaited<ReturnType<typeof fetchPortfolioEditorRows>>>([]);
  function reload() {
    return fetchPortfolioEditorRows(contractorId).then(setRows);
  }
  useEffect(() => {
    void reload().catch((err: Error) => onError(err.message));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [contractorId, onError]);
  return (
    <div className="space-y-2">
      <h2 className="font-semibold text-forest-800">Portfolio</h2>
      {rows.length === 0 ? <PortfolioExample /> : null}
      <PortfolioPhotoEditor
        rows={rows}
        editing
        onAddFile={(file) => {
          void uploadContractorDoc({ userId, folder: "portfolio", file })
            .then((path) =>
              addPortfolioItem({
                contractor_profile_id: contractorId,
                title: "Portfolio photo",
                storage_path: path,
              }),
            )
            .then(() => reload())
            .catch((err: Error) => onError(err.message));
        }}
        onRemove={(id) => {
          void deletePortfolioItem(id)
            .then(() => reload())
            .catch((err: Error) => onError(err.message));
        }}
        onSaveCaption={(id, title) => {
          setRows((current) =>
            current.map((row) => (row.id === id ? { ...row, title, privacy_state: "REVIEW_REQUIRED" } : row)),
          );
          void updatePortfolioItem(id, { title })
            .then(() => reload())
            .catch((err: Error) => onError(err.message));
        }}
      />
    </div>
  );
}

function historyStatusLabel(status: string, projectStatus?: string | null): string {
  if (projectStatus === "CANCELLED") return "Cancelled";
  if (status === "PASSED") return "Passed";
  if (status === "WITHDRAWN") return "Withdrawn";
  return OPPORTUNITY_STATUS_LABELS[status as keyof typeof OPPORTUNITY_STATUS_LABELS] ?? "Closed";
}

type JobsTab = "hired" | "open" | "history";

export function OpportunitiesPage() {
  const [params] = useSearchParams();
  const initialTab: JobsTab = params.get("tab") === "open" ? "open" : params.get("tab") === "history" ? "history" : "hired";
  const [tab, setTab] = useState<JobsTab>(initialTab);
  const { user } = useAuth();
  const [rows, setRows] = useState<OpportunityRow[]>([]);
  const [hiredProjects, setHiredProjects] = useState<Set<string>>(new Set());
  const [recovered, setRecovered] = useState<Record<string, { title?: string; reference_number?: number | null }>>({});
  const [error, setError] = useState<string | null>(null);
  const [passId, setPassId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const toast = useToast();

  function reload() {
    if (!user) return Promise.resolve();
    return fetchContractorProfileByUser(user.id)
      .then((profile) => {
        if (!profile) throw new Error("Contractor profile missing.");
        return Promise.all([
          fetchMyOpportunities(profile.id),
          fetchMyBookings("contractor", profile.id).catch(() => []),
        ]);
      })
      .then(([next, bookings]) => {
        setRows(next);
        setHiredProjects(hiredProjectIdSet(bookings as Parameters<typeof hiredProjectIdSet>[0]));
        setError(null);
        const missing = next.filter((row) => !row.projects?.title).map((row) => row.project_id);
        if (missing.length === 0) return;
        return fetchProjectSummaries(missing)
          .then((summaries) => {
            setRecovered(
              Object.fromEntries(
                summaries.map((project) => [project.id, { title: project.title, reference_number: project.reference_number }]),
              ),
            );
          })
          .catch(() => undefined);
      });
  }

  useEffect(() => {
    if (!user) return;
    void reload().catch((err: Error) => setError(err.message));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

  const active = rows.filter((row) => row.status === "AVAILABLE" || row.status === "ACCEPTED");
  const history = rows.filter((row) => row.status !== "AVAILABLE" && row.status !== "ACCEPTED");
  const live = active.filter(
    (row) => row.projects?.status !== "CANCELLED" && !hiredProjects.has(row.project_id),
  );
  const historyRows = history
    .filter((row) => row.projects?.status === "CANCELLED" || row.status === "CLOSED" || row.status === "PASSED")
    .slice(0, 8);

  return (
    <div className="space-y-6">
      <h1 className="font-display text-4xl font-semibold text-forest-800">Jobs</h1>
      <div className="flex flex-wrap gap-2" aria-label="Job lists">
        {(
          [
            ["hired", "Hired jobs"],
            ["open", "Open jobs"],
            ["history", "History"],
          ] as const
        ).map(([key, label]) => (
          <button
            key={key}
            type="button"
            className={`min-h-11 rounded-full px-4 text-sm font-semibold ${
              tab === key ? "bg-forest-800 text-cream-50" : "bg-cream-100 text-forest-800"
            }`}
            aria-pressed={tab === key}
            onClick={() => setTab(key)}
          >
            {label}
          </button>
        ))}
      </div>
      {tab === "hired" ? <HiredJobsPanel showHeading={false} /> : null}
      {tab === "open" ? <p className="text-sm text-ink-700">{JOBS_STREET_HELPER_COPY}</p> : null}
      {tab === "history" ? <p className="text-sm text-ink-700">{HISTORY_JOBS_COPY}</p> : null}
      <FormError message={error} />
      {tab === "open" && live.length === 0 ? (
        <EmptyState title="No open jobs" body="Nearby matching jobs will land here. You can browse anonymized opportunities at no charge. At most three paid connections per project. Cancelled jobs leave this list." />
      ) : null}
      {tab === "open" && live.length > 0 ? (
        <ul className="space-y-3">
          {live.map((row) => {
            const showPass =
              !hiredProjects.has(row.project_id) &&
              canContractorEndJob({
                opportunityStatus: row.status,
                projectStatus: row.projects?.status,
              });
            return (
              <li key={row.id} className="rounded-3xl border border-forest-800/10 px-5 py-4">
                <HumanStatus label={OPPORTUNITY_STATUS_LABELS[row.status]} />
                <p className="mt-2 font-semibold text-forest-800">{opportunityListTitle(row)}</p>
                <JobReference value={row.projects?.reference_number} />
                <p className="text-sm text-ink-500">
                  {[row.projects?.city, row.projects?.state, row.projects?.zip_code].filter(Boolean).join(", ")}
                </p>
                <div className="mt-4 flex flex-col items-stretch gap-1">
                  <ButtonLink to={`/app/pro/opportunities/${row.id}`} className="min-h-14 w-full">
                    View job
                  </ButtonLink>
                  {showPass ? (
                    <button
                      type="button"
                      className="mx-auto block min-h-11 px-2 text-sm font-medium text-ink-500 underline decoration-ink-500/30 underline-offset-4 hover:text-forest-800"
                      disabled={busy}
                      onClick={() => setPassId(row.id)}
                    >
                      {declineJobButtonLabel(null)}
                    </button>
                  ) : null}
                </div>
              </li>
            );
          })}
        </ul>
      ) : null}
      {tab === "history" && historyRows.length > 0 ? (
        <section className="space-y-3">
          <h2 className="font-display text-2xl text-forest-800">History</h2>
          <ul className="space-y-3">
            {historyRows.map((row) => {
              const recoveredRow = recovered[row.project_id];
              const title = row.projects?.title?.trim() || recoveredRow?.title?.trim() || opportunityListTitle(row);
              const reference = row.projects?.reference_number ?? recoveredRow?.reference_number;
              return (
              <li key={row.id}>
                <Link to={`/app/pro/opportunities/${row.id}`} className="block rounded-3xl border border-forest-800/10 px-5 py-4">
                  <HumanStatus label={historyStatusLabel(row.status, row.projects?.status)} />
                  <p className="mt-2 font-semibold text-forest-800">{title}</p>
                  <JobReference value={reference} copy={false} />
                  {row.status === "PASSED" ? (
                    <p className="mt-1 text-sm text-ink-500">
                      {title === "Passed job" && reference == null
                        ? "You passed on this job. The project title is no longer available."
                        : "You passed on this job. It is no longer actionable for you."}
                    </p>
                  ) : null}
                </Link>
              </li>
              );
            })}
          </ul>
        </section>
      ) : null}
      <EndJobDialog
        open={Boolean(passId)}
        busy={busy}
        connectionStatus={null}
        onClose={() => {
          if (!busy) setPassId(null);
        }}
        onConfirm={() => {
          if (!passId) return;
          setBusy(true);
          void endContractorJob(passId)
            .then(() => {
              toast.push(declineJobToast(null));
              setPassId(null);
              return reload();
            })
            .catch((err: Error) => setError(friendlyEndJobError(err.message)))
            .finally(() => setBusy(false));
        }}
      />
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
  const [booking, setBooking] = useState<Booking | null>(null);
  const [prompt, setPrompt] = useState("");
  const [busy, setBusy] = useState(false);
  const [connectOpen, setConnectOpen] = useState(false);
  const [endOpen, setEndOpen] = useState(false);

  async function reload() {
    const opp = await fetchOpportunity(opportunityId);
    setRow(opp);
    const [photoRows, projectAnswers, spots, mine, selectedBooking, mineBookings] = await Promise.all([
      fetchProjectPhotos(opp.project_id),
      fetchProjectAnswers(opp.project_id),
      fetchProjectConnectionAvailability(opp.project_id).catch(() => null),
      fetchMyProjectConnections(opp.project_id).catch(() => []),
      fetchProjectBooking(opp.project_id).catch(() => null),
      user
        ? fetchContractorProfileByUser(user.id)
            .then((profile) => (profile ? fetchMyBookings("contractor", profile.id) : []))
            .catch(() => [])
        : Promise.resolve([]),
    ]);
    setAvailability(spots);
    setMyConnection(mine[0] ?? null);
    const hiredBooking =
      (mineBookings as Booking[]).find(
        (item) =>
          item.project_id === opp.project_id &&
          hiredJobChip({
            bookingStatus: item.status,
            customerHiredAt: item.customer_hired_at,
            contractorHiredAt: item.contractor_hired_at,
          }),
      ) ?? null;
    setBooking(hiredBooking ?? selectedBooking);
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
    if (!isQueryableId(opportunityId)) return;
    void reload().catch((err: Error) => setError(friendlyNotFound(err.message, "We couldn't open that job.")));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [opportunityId]);

  if (!isQueryableId(opportunityId)) {
    return <EmptyState title="Job not found" body="Check the link, or open it from Jobs." />;
  }
  if (!row) return error ? <ErrorState message={friendlyNotFound(error, "We couldn't open that job.")} /> : <LoadingState label="Loading job" />;
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
    checkoutEnabled: availability?.checkout_enabled === true,
  });
  const hiredHere = Boolean(
    booking &&
      hiredJobChip({
        bookingStatus: booking.status,
        customerHiredAt: booking.customer_hired_at,
        contractorHiredAt: booking.contractor_hired_at,
      }),
  );
  const connectedHere = connectionUiState === "connected";
  const showConnectionCta = !cancelled && !hiredHere && !connectedHere && opportunityAllowsConnectCta(row.status);
  const showSpots = !cancelled && !hiredHere && !connectedHere;
  const showDecline =
    !hiredHere &&
    !connectedHere &&
    canContractorEndJob({
      opportunityStatus: row.status,
      projectStatus: project?.status,
      connectionStatus: myConnection?.status ?? null,
    });

  return (
    <div className="space-y-6">
      <HumanStatus label={cancelled ? "Cancelled" : OPPORTUNITY_STATUS_LABELS[row.status]} />
      <h1 className="font-display text-4xl font-semibold text-forest-800">{opportunityListTitle(row)}</h1>
      <JobReference value={project?.reference_number} />
      <FormError message={error} />
      {cancelled ? (
        <StatusBanner tone="warning" title="This project was cancelled" body="It is no longer an active opportunity. Your estimate history is kept if you already participated." />
      ) : null}
      {row.status === "PASSED" && !cancelled ? (
        <StatusBanner tone="info" title="You passed on this job" body="It is no longer an open opportunity for you. You cannot reclaim it." />
      ) : null}
      {notices.map((notice) => (
        <StatusBanner key={notice.id} title={notice.title} body={notice.body} tone={notice.kind.includes("SCOPE") ? "warning" : "info"} />
      ))}
      <section className="rounded-3xl border border-forest-800/10 px-5 py-4 text-sm">
        <p>{project?.description}</p>
        <p className="mt-2 font-semibold">Approximate location</p>
        <p>{[project?.city, project?.state].filter(Boolean).join(", ") || "Approximate location not listed"}</p>
        {hiredHere || connectedHere ? (
          <p className="text-ink-500">
            Phone, email, and street are on the job page. They stay hidden until the customer shares them.
          </p>
        ) : (
          <p className="text-ink-500">{OPPORTUNITY_CONTACT_LOCKED_COPY}</p>
        )}
        <p className="mt-2">{project?.timing ? TIMING_LABELS[project.timing] : ""}</p>
        {project?.budget_min_cents != null || project?.budget_max_cents != null ? (
          <p className="mt-2">
            Rough budget{" "}
            {project.budget_min_cents != null ? formatUsdFromCents(project.budget_min_cents) : "open"} –{" "}
            {project.budget_max_cents != null ? formatUsdFromCents(project.budget_max_cents) : "open"}
          </p>
        ) : null}
        {showSpots ? <p className="mt-3 font-semibold text-forest-800">{spotsLabel}</p> : null}
        {showConnectionCta ? <p className="mt-2 text-sm font-medium text-forest-800">{CONNECT_SINGLE_STEP_COPY}</p> : null}
      </section>
      <div className="grid grid-cols-2 gap-2">
        {photos.map((photo) => (
          <figure key={photo.id} className="space-y-1">
            <img src={photo.url} alt="Project photo" className="h-28 w-full rounded-2xl object-cover" />
            <button
              type="button"
              className="inline-flex min-h-11 items-center text-xs font-semibold text-forest-800"
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
      {booking ? (
        <>
          <HiredConfirmationCard
            role="contractor"
            bookingStatus={booking.status}
            customerHiredAt={booking.customer_hired_at}
            contractorHiredAt={booking.contractor_hired_at}
            busy={busy}
            onConfirm={() => {
              setBusy(true);
              void confirmBookingHired(booking.id)
                .then(() => {
                  toast.push("Hired confirmed.");
                  return reload();
                })
                .catch((err: Error) => setError(err.message))
                .finally(() => setBusy(false));
            }}
          />
          <ButtonLink to={`/app/pro/jobs/${booking.id}`} className="min-h-14 w-full">
            Open job
          </ButtonLink>
        </>
      ) : null}
      {showConnectionCta ? (
        <ContractorConnectionCta state={connectionUiState} busy={busy} onConnect={() => setConnectOpen(true)} />
      ) : null}
      {showDecline ? (
        <button
          type="button"
          className="mx-auto block min-h-11 px-2 text-sm font-medium text-ink-500 underline decoration-ink-500/30 underline-offset-4 hover:text-forest-800"
          disabled={busy}
          onClick={() => setEndOpen(true)}
        >
          {declineJobButtonLabel(myConnection?.status ?? null)}
        </button>
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
            .then((flags) =>
              runContractorConnect({
                opportunityStatus: row.status,
                accept: () => acceptOpportunity(row.id),
                checkoutEnabled: flags.enabled,
                startCheckout: () =>
                  startConnectionCheckout({
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
                  }),
                requestConnection: () =>
                  requestProjectConnection(row.project_id).then(() => {
                    toast.push(CONNECT_PAYMENTS_OFF_COPY);
                    setConnectOpen(false);
                    return reload();
                  }),
              }),
            )
            .catch((err: Error) => setError(err.message))
            .finally(() => setBusy(false));
        }}
      />
      <EndJobDialog
        open={endOpen}
        busy={busy}
        connectionStatus={myConnection?.status ?? null}
        onClose={() => setEndOpen(false)}
        onConfirm={() => {
          setBusy(true);
          void endContractorJob(row.id)
            .then(() => {
              toast.push(declineJobToast(myConnection?.status ?? null));
              setEndOpen(false);
              return navigate("/app/pro/opportunities");
            })
            .catch((err: Error) => setError(friendlyEndJobError(err.message)))
            .finally(() => setBusy(false));
        }}
      />
    </div>
  );
}

export function EstimateBuilderPage() {
  const { opportunityId = "" } = useParams();
  const navigate = useNavigate();
  const toast = useToast();
  const { user } = useAuth();
  const [error, setError] = useState<string | null>(null);
  const [estimateId, setEstimateId] = useState<string | null>(null);
  const [status, setStatus] = useState<EstimateStatus>("DRAFT");
  const [withdrawOpen, setWithdrawOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);
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
  const [referenceNumber, setReferenceNumber] = useState<number | null>(null);
  const [loaded, setLoaded] = useState(false);

  async function load() {
    if (!user) return;
    const opp = await fetchOpportunity(opportunityId);
    setReferenceNumber(opp.projects?.reference_number ?? null);
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
    if (!estimateId || !canSubmitFrom(status)) return;
    void updateEstimateDetails(estimateId, patch).catch((err: Error) => setError(err.message));
  }

  useEffect(() => {
    if (!isQueryableId(opportunityId)) return;
    setLoaded(false);
    void load()
      .catch((err: Error) => setError(friendlyNotFound(err.message, "We couldn't open that estimate.")))
      .finally(() => setLoaded(true));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [opportunityId, user]);

  if (!isQueryableId(opportunityId)) {
    return <EmptyState title="Estimate not found" body="Open the estimate from My Estimates." />;
  }
  if (!loaded) return <LoadingState label="Loading estimate" />;
  const editable = canSubmitFrom(status);

  return (
    <div className="mx-auto max-w-xl space-y-6" data-pwa-form="estimate">
      <h1 className="font-display text-4xl font-semibold text-forest-800">Estimate</h1>
      <p className="text-sm font-semibold text-forest-800">{contractorEstimateStatusLabel(status)}</p>
      {!editable ? (
        <p className="text-sm text-ink-700">
          This estimate is {contractorEstimateStatusLabel(status).toLowerCase()}. It can no longer be edited.
        </p>
      ) : null}
      <JobReference value={referenceNumber} />
      <p className="text-sm text-ink-700">
        Line totals are computed for you. Submitting an estimate is never charged. PPP does not take a percentage of
        the job. {paymentsComingSoonCopy()}
      </p>
      <FormError message={error} />
      <ul className="space-y-2">
        {items.map((item) => (
          <li key={item.id} className="flex items-start justify-between gap-3 rounded-2xl bg-cream-100 px-3 py-2 text-sm">
            <span className="min-w-0 break-words">
              {ESTIMATE_ITEM_KIND_LABELS[(item.kind as EstimateItemKind) ?? "CUSTOM"]}: {item.label} · {item.quantity}{" "}
              {item.unit_label || "each"} × {formatUsdFromCents(item.unit_cents)} = {formatUsdFromCents(item.line_total_cents)}
            </span>
            {editable ? (
              <button
                type="button"
                className="min-h-11 shrink-0 font-semibold text-danger-600"
                aria-label={`Remove ${item.label}`}
                onClick={() => void deleteEstimateItem(item.id).then(load).catch((err: Error) => setError(err.message))}
              >
                Remove
              </button>
            ) : null}
          </li>
        ))}
      </ul>
      {editable ? (
        <>
          <label className="block">
            <span className="mb-1.5 block text-xs font-semibold uppercase tracking-[0.16em] text-gold-700">
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
        </>
      ) : null}
      <div className="rounded-3xl border border-forest-800/10 px-4 py-3 text-sm">
        <p>Total {formatUsdFromCents(totalCents)}</p>
        <p className="text-ink-500">No PPP percentage is taken from this estimate. Connection is a separate $4.99 choice.</p>
      </div>
      <TextInput
        label="Duration (hours)"
        inputMode="decimal"
        value={duration}
        disabled={!editable}
        onChange={(e) => setDuration(e.target.value)}
        onBlur={() => saveDetails({ duration_hours: duration ? Number(duration) : null })}
      />
      <TextInput
        label="Available from"
        type="date"
        value={availableFrom}
        readOnly={!editable}
        onChange={(e) => setAvailableFrom(e.target.value)}
        onBlur={() => saveDetails({ available_from: availableFrom || null })}
      />
      <TextInput
        label="Estimate expires"
        type="date"
        value={validUntil}
        readOnly={!editable}
        onChange={(e) => setValidUntil(e.target.value)}
        onBlur={() => saveDetails({ valid_until: validUntil || null })}
      />
      <label className="block">
        <span className="mb-1.5 block text-xs font-semibold uppercase tracking-[0.16em] text-gold-700">Notes</span>
        <textarea
          className="w-full rounded-2xl border border-forest-800/15 bg-cream-50 px-4 py-3"
          rows={3}
          readOnly={!editable}
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          onBlur={() => saveDetails({ notes })}
        />
        <span className="mt-1.5 block text-sm text-ink-500">{PRE_HIRE_CONTACT_HINT}</span>
      </label>
      <div className="sticky bottom-[calc(6.5rem+env(safe-area-inset-bottom))] z-20 flex flex-col gap-3 bg-cream-50/95 py-3 sm:flex-row lg:bottom-4">
        {editable ? (
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
        ) : null}
        {contractorEstimateDestructiveAction(status) === "withdraw" ? (
          <Button
            type="button"
            variant="outline"
            className="min-h-14 flex-1"
            onClick={() => setWithdrawOpen(true)}
          >
            {WITHDRAW_ESTIMATE_LABEL}
          </Button>
        ) : null}
        {contractorEstimateDestructiveAction(status) === "delete" ? (
          <Button
            type="button"
            variant="outline"
            className="min-h-14 flex-1 text-danger-600"
            onClick={() => setDeleteOpen(true)}
          >
            {DELETE_ESTIMATE_LABEL}
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
      <ConfirmDialog
        open={deleteOpen}
        title={DELETE_ESTIMATE_TITLE}
        body={DELETE_ESTIMATE_BODY}
        confirmLabel={DELETE_ESTIMATE_CONFIRM}
        cancelLabel="Keep draft"
        busy={deleting}
        onClose={() => {
          if (!deleting) setDeleteOpen(false);
        }}
        onConfirm={() => {
          if (!estimateId) return;
          setDeleting(true);
          void deleteEstimate(estimateId)
            .then(() => {
              toast.push(DELETE_ESTIMATE_SUCCESS);
              setDeleteOpen(false);
              return navigate("/app/pro/estimates");
            })
            .catch((err: Error) => setError(err.message))
            .finally(() => setDeleting(false));
        }}
      />
    </div>
  );
}

export function ProJobsPage() {
  return <OpportunitiesPage />;
}

export { ProMessagesPage } from "../messages/ProjectMessagesPage";
