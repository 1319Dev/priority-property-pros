import { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { ContractorAvatar } from "../../../components/media/ContractorAvatar";
import { HiredConfirmationCard } from "../../../components/marketplace/HiredConfirmation";
import { EmptyState } from "../../../components/layout/DashboardShell";
import { Button, ButtonLink } from "../../../components/ui/Button";
import { ConfirmDialog } from "../../../components/ui/ConfirmDialog";
import { ErrorState, LoadingState, NotFoundState } from "../../../components/ui/PageState";
import { HumanStatus, StatusBanner } from "../../../components/ui/StatusBanner";
import { FormError } from "../../../lib/auth/AuthCard";
import { displayName } from "../../../lib/auth/roles";
import { useAuth } from "../../../lib/auth/useAuth";
import {
  answerEstimateQuestion,
  cancelCustomerProject,
  confirmBookingHired,
  declineEstimate,
  fetchCustomerProjects,
  fetchEstimate,
  fetchEstimateItems,
  fetchEstimateQuestions,
  fetchMyBookings,
  fetchMyCustomerProject,
  fetchPrivateLocation,
  fetchProjectBooking,
  fetchProjectEstimates,
  fetchProjectNotices,
  fetchPublicContractor,
  fetchPublicContractorExtras,
  markEstimateViewed,
  selectEstimate,
  stopNewProjectConnections,
  TIMING_LABELS,
} from "../../../lib/marketplace/api";
import { formatUsdFromCents } from "../../../lib/marketplace/fees";
import {
  CANCEL_PROJECT_TOAST,
  COMPARE_INTRO,
  CUSTOMER_HOME_EMPTY,
  CUSTOMER_HOME_INTRO,
  CUSTOMER_PAYS_DIRECTLY,
  NO_PROS_YET,
  OFFER_QUEUE_PLAIN,
  SELECT_CONFIRM_BODY,
  SELECTED_BOOKING_COPY,
  STOP_CONNECTIONS_BODY,
  STOP_CONNECTIONS_TOAST,
  STREET_STAYS_PRIVATE,
} from "../../../lib/marketplace/customerCopy";
import { ESTIMATE_ITEM_KIND_LABELS, type Booking, type EstimateItemKind, type EstimateStatus, type Project } from "../../../lib/marketplace/types";
import { planDeleteOrCancel } from "../../../lib/marketplace/lifecycle";
import {
  canCustomerDeclineFrom,
  canCustomerSelectFrom,
  customerEstimateStatusLabel,
  liveCustomerEstimates,
} from "../../../lib/marketplace/estimateLifecycle";
import { formatCityStateZip } from "../../../lib/marketplace/location";
import { formatBudgetRange } from "../../../lib/marketplace/wizardValidation";
import {
  CUSTOMER_DASHBOARD_TABS,
  customerLifecycleLabel,
  customerLifecycleState,
  customerNextActions,
  customerVisibleProjects,
  type CustomerDashboardTab,
} from "../../../lib/marketplace/statusLabels";
import { estimateNeedsNewSubmission } from "../../../lib/marketplace/privacy";
import { useToast } from "../../../hooks/useToast";
import { InboxHomeCards } from "../../../components/marketplace/InboxHomeCards";

function bookingByProject(bookings: Booking[]) {
  const map = new Map<string, Booking>();
  for (const row of bookings) {
    const current = map.get(row.project_id);
    if (!current) {
      map.set(row.project_id, row);
      continue;
    }
    if (row.status === "COMPLETED" || current.status === "CANCELLED") map.set(row.project_id, row);
  }
  return map;
}

export function CustomerHomePage() {
  const { profile } = useAuth();
  const name = profile ? displayName(profile.first_name, profile.last_name, profile.email) : "there";
  const [projects, setProjects] = useState<Project[]>([]);
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!profile) return;
    void Promise.all([fetchCustomerProjects(profile.id), fetchMyBookings("customer", profile.id)])
      .then(([nextProjects, nextBookings]) => {
        setProjects(nextProjects);
        setBookings(nextBookings as Booking[]);
      })
      .catch((err: Error) => setError(err.message))
      .finally(() => setLoading(false));
  }, [profile]);

  const map = bookingByProject(bookings);
  const recent = customerVisibleProjects(projects).slice(0, 4);

  return (
    <div className="space-y-6">
      <header>
        <HumanStatus label="Customer" />
        <h1 className="mt-2 font-display text-4xl font-semibold text-forest-800">Hello, {name}.</h1>
        <p className="mt-3 max-w-xl text-ink-700">
          {CUSTOMER_HOME_INTRO} {CUSTOMER_PAYS_DIRECTLY}
        </p>
      </header>
      <InboxHomeCards role="customer" />
      <ButtonLink to="/app/customer/projects/new/wizard" className="min-h-14">
        Post a project
      </ButtonLink>
      {error ? <ErrorState message={error} /> : null}
      {loading ? <LoadingState /> : null}
      {!loading && recent.length === 0 ? (
        <EmptyState
          title="No projects yet"
          body={CUSTOMER_HOME_EMPTY}
        />
      ) : null}
      <ul className="space-y-3">
        {recent.map((project) => {
          const booking = map.get(project.id) ?? (project.selected_booking_id ? bookings.find((row) => row.id === project.selected_booking_id) : undefined);
          const actions = customerNextActions({
            projectId: project.id,
            projectStatus: project.status,
            bookingId: booking?.id ?? project.selected_booking_id,
            bookingStatus: booking?.status ?? null,
            customerHiredAt: booking?.customer_hired_at,
            contractorHiredAt: booking?.contractor_hired_at,
          });
          return (
            <li key={project.id} className="rounded-3xl border border-forest-800/10 bg-cream-50 px-5 py-4">
              <HumanStatus label={customerLifecycleLabel(project.status, booking?.status ?? null)} />
              <p className="mt-2 font-semibold text-forest-800">{project.title || "Project"}</p>
              <div className="mt-3 flex min-w-0 flex-col gap-2 sm:flex-row">
                {actions.slice(0, 2).map((action) => (
                  <ButtonLink key={action.label} to={action.to} variant={action.variant ?? "primary"} size="sm" className="w-full sm:w-auto">
                    {action.label}
                  </ButtonLink>
                ))}
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

export function CustomerProjectsPage() {
  const { profile } = useAuth();
  const [projects, setProjects] = useState<Project[]>([]);
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [tab, setTab] = useState<CustomerDashboardTab>("active");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!profile) return;
    void Promise.all([fetchCustomerProjects(profile.id), fetchMyBookings("customer", profile.id)])
      .then(([nextProjects, nextBookings]) => {
        setProjects(nextProjects);
        setBookings(nextBookings as Booking[]);
      })
      .catch((err: Error) => setError(err.message))
      .finally(() => setLoading(false));
  }, [profile]);

  const map = bookingByProject(bookings);
  const listed = customerVisibleProjects(projects);

  const classified = useMemo(
    () =>
      listed.map((project) => {
        const booking = map.get(project.id);
        return {
          project,
          booking,
          state: customerLifecycleState(project.status, booking?.status ?? null),
        };
      }),
    [listed, map],
  );

  const counts = useMemo(() => {
    const next: Record<CustomerDashboardTab, number> = { active: 0, completed: 0, cancelled: 0 };
    for (const item of classified) {
      const match = CUSTOMER_DASHBOARD_TABS.find((tabItem) => (tabItem.states as readonly string[]).includes(item.state));
      if (match) next[match.key] += 1;
    }
    return next;
  }, [classified]);

  const filtered = classified.filter((item) => {
    const match = CUSTOMER_DASHBOARD_TABS.find((tabItem) => tabItem.key === tab);
    return Boolean(match && (match.states as readonly string[]).includes(item.state));
  });

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="font-display text-4xl font-semibold text-forest-800">My projects</h1>
        <ButtonLink to="/app/customer/projects/new/wizard" size="sm">
          New
        </ButtonLink>
      </div>
      <FormError message={error} />
      <div className="flex flex-wrap gap-2">
        {CUSTOMER_DASHBOARD_TABS.map((item) => (
          <button
            key={item.key}
            type="button"
            className={`min-h-11 rounded-full px-4 py-2 text-sm font-semibold ${
              tab === item.key ? "bg-forest-800 text-cream-50" : "bg-cream-100 text-forest-800"
            }`}
            onClick={() => setTab(item.key)}
          >
            {item.label} ({counts[item.key]})
          </button>
        ))}
      </div>
      {loading ? <LoadingState /> : null}
      {!loading && filtered.length === 0 ? (
        <EmptyState
          title={tab === "cancelled" ? "No cancelled projects" : tab === "completed" ? "No completed projects" : "No active projects"}
          body={
            tab === "cancelled"
              ? "Cancelled projects stay on this list."
              : tab === "completed"
                ? "Jobs you mark complete show up here."
                : "Posted projects show up here."
          }
        />
      ) : (
        <ul className="space-y-3">
          {filtered.map(({ project, booking, state }) => {
            const actions = customerNextActions({
              projectId: project.id,
              projectStatus: project.status,
              bookingId: booking?.id ?? project.selected_booking_id,
              bookingStatus: booking?.status ?? null,
              customerHiredAt: booking?.customer_hired_at,
              contractorHiredAt: booking?.contractor_hired_at,
            });
            return (
              <li key={project.id} className="rounded-3xl border border-forest-800/10 bg-cream-50 px-5 py-4">
                <HumanStatus label={customerLifecycleLabel(project.status, booking?.status ?? null)} />
                <p className="mt-2 font-semibold text-forest-800">{project.title || "Project"}</p>
                {state === "cancelled" ? <p className="mt-1 text-sm text-ink-500">Cancelled</p> : null}
                <div className="mt-3 flex min-w-0 flex-col gap-2">
                  {actions.map((action) => (
                    <ButtonLink key={action.label} to={action.to} variant={action.variant ?? "primary"} className="min-h-12 w-full">
                      {action.label}
                    </ButtonLink>
                  ))}
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

export function CustomerProjectDetailPage() {
  const { projectId = "" } = useParams();
  const navigate = useNavigate();
  const toast = useToast();
  const { profile } = useAuth();
  const [project, setProject] = useState<Project | null>(null);
  const [booking, setBooking] = useState<Booking | null>(null);
  const [missing, setMissing] = useState(false);
  const [street, setStreet] = useState<string | null>(null);
  const [questions, setQuestions] = useState<Awaited<ReturnType<typeof fetchEstimateQuestions>>>([]);
  const [notices, setNotices] = useState<Awaited<ReturnType<typeof fetchProjectNotices>>>([]);
  const [error, setError] = useState<string | null>(null);
  const [reply, setReply] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [cancelOpen, setCancelOpen] = useState(false);
  const [stopOpen, setStopOpen] = useState(false);
  const [cancelBody, setCancelBody] = useState("");
  const [cancelAction, setCancelAction] = useState<"delete" | "cancel">("cancel");
  const [busy, setBusy] = useState(false);

  async function reload() {
    const row = await fetchMyCustomerProject(projectId);
    setProject(row);
    const selected = await fetchProjectBooking(projectId).catch(() => null);
    setBooking(selected);
    const loc = await fetchPrivateLocation(projectId).catch(() => null);
    setStreet(loc?.street_line1 ?? null);
    setQuestions(await fetchEstimateQuestions(projectId));
    setNotices(await fetchProjectNotices(projectId).catch(() => []));
  }

  useEffect(() => {
    void reload()
      .catch(() => setMissing(true))
      .finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId]);

  if (loading) return <LoadingState label="Loading project" />;
  if (missing || !project) {
    return <NotFoundState title="Project not found" body="This project is not in your account. You can only open jobs you posted." />;
  }

  const canEdit = project.status !== "DRAFT" && project.status !== "CANCELLED" && project.status !== "CONTRACTOR_SELECTED";
  const canRemove = project.status !== "CANCELLED";

  return (
    <div className="space-y-6">
      <header>
        <HumanStatus label={customerLifecycleLabel(project.status, booking?.status ?? null)} />
        <h1 className="mt-2 font-display text-4xl font-semibold text-forest-800">{project.title || "Project"}</h1>
        <p className="mt-3 text-sm text-ink-700">{CUSTOMER_PAYS_DIRECTLY}</p>
      </header>
      {project.status === "CANCELLED" ? (
        <StatusBanner tone="warning" title="Cancelled" body="This project left the marketplace. Estimates are kept in your history." />
      ) : null}
      {notices.slice(0, 3).map((notice) => (
        <StatusBanner key={notice.id} title={notice.title} body={notice.body} tone={notice.kind.includes("CANCEL") ? "warning" : "info"} />
      ))}
      <FormError message={error} />
      <section className="rounded-3xl border border-forest-800/10 bg-cream-50 px-5 py-4 text-sm">
        <h2 className="font-display text-2xl text-forest-800">Job details</h2>
        <p className="mt-3 whitespace-pre-wrap">{project.description || "No description yet."}</p>
        <p className="mt-3">{formatCityStateZip(project.city, project.state, project.zip_code)}</p>
        <p>{STREET_STAYS_PRIVATE}{street ? ` On file: ${street}` : ""}</p>
        <p>{project.timing ? TIMING_LABELS[project.timing] : ""}</p>
        {project.preferred_date ? <p>Preferred date: {project.preferred_date}</p> : null}
        <p>
          Budget: {formatBudgetRange(project.budget_min_cents, project.budget_max_cents, formatUsdFromCents)}
        </p>
      </section>
      {project.status !== "DRAFT" && project.status !== "CANCELLED" && project.status !== "CONTRACTOR_SELECTED" ? (
        <StatusBanner
          tone="info"
          title="Finding local pros"
          body={project.status === "MATCHING" ? NO_PROS_YET : OFFER_QUEUE_PLAIN}
        />
      ) : null}
      {project.status === "DRAFT" ? (
        <div className="space-y-3">
          <p className="text-ink-700">This project was never posted. Nothing is kept until you hit Post.</p>
          <ButtonLink to="/app/customer/projects/new/wizard" className="min-h-14 w-full">
            Post a project
          </ButtonLink>
        </div>
      ) : null}
      <div className="flex min-w-0 flex-col gap-2">
        {canEdit ? (
          <ButtonLink to={`/app/customer/projects/${project.id}/edit`} className="min-h-14 w-full">
            Edit
          </ButtonLink>
        ) : null}
        {canEdit && project.accepting_connections !== false ? (
          <Button
            type="button"
            variant="outline"
            className="min-h-14 w-full"
            onClick={() => setStopOpen(true)}
          >
            Stop New Connections
          </Button>
        ) : null}
        {project.accepting_connections === false ? (
          <p className="text-sm text-ink-500">New connections are closed. Existing unlocked connections were kept.</p>
        ) : null}
        {project.status === "ESTIMATES_AVAILABLE" || project.status === "CONTRACTOR_SELECTED" ? (
          <ButtonLink to={`/app/customer/projects/${project.id}/compare`} variant="outline" className="min-h-14 w-full">
            Compare estimates
          </ButtonLink>
        ) : null}
        {project.selected_booking_id ? (
          <ButtonLink to={`/app/customer/bookings/${project.selected_booking_id}`} variant="outline" className="min-h-14 w-full">
            View booking
          </ButtonLink>
        ) : null}
        {canRemove ? (
          <Button
            type="button"
            variant="ghost"
            className="min-h-12 w-full"
            onClick={() => {
              const plan = planDeleteOrCancel({
                isOwner: profile?.id === project.customer_id,
                isAdmin: false,
                projectStatus: project.status,
                bookingStatus: project.status === "CONTRACTOR_SELECTED" ? "PENDING" : null,
                participation: {
                  acceptedOpportunityCount: 0,
                  submittedEstimateCount: project.status === "ESTIMATES_AVAILABLE" || project.status === "CONTRACTORS_RESPONDING" ? 1 : 0,
                  opportunityCount: project.status === "DRAFT" ? 0 : 1,
                },
              });
              if (plan.action === "block") {
                setError(plan.message);
                return;
              }
              setCancelAction(plan.action);
              setCancelBody(plan.message);
              setCancelOpen(true);
            }}
          >
            Cancel project
          </Button>
        ) : null}
      </div>
      {booking ? (
        <HiredConfirmationCard
          role="customer"
          bookingStatus={booking.status}
          customerHiredAt={booking.customer_hired_at}
          contractorHiredAt={booking.contractor_hired_at}
          contractorProfileId={booking.contractor_profile_id}
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
      ) : null}
      <section className="space-y-3">
        <h2 className="font-display text-2xl text-forest-800">Questions from contractors</h2>
        {questions.length === 0 ? <p className="text-ink-500">No questions yet.</p> : null}
        {questions.map((item) => (
          <div key={item.id} className="rounded-2xl border border-forest-800/10 px-4 py-3">
            <p className="font-semibold">{item.prompt}</p>
            {item.answer_text ? (
              <p className="mt-2 text-sm text-ink-700">{item.answer_text}</p>
            ) : project.status === "CANCELLED" ||
              project.status === "CONTRACTOR_SELECTED" ||
              Boolean(booking?.customer_hired_at && booking?.contractor_hired_at) ? (
              <p className="mt-2 text-sm text-ink-500">This question is closed.</p>
            ) : (
              <form
                className="mt-2 space-y-2"
                onSubmit={(event) => {
                  event.preventDefault();
                  void answerEstimateQuestion(item.id, reply[item.id] ?? "")
                    .then(reload)
                    .catch((err: Error) => setError(err.message));
                }}
              >
                <textarea
                  className="w-full rounded-2xl border border-forest-800/15 px-3 py-2"
                  value={reply[item.id] ?? ""}
                  onChange={(e) => setReply((current) => ({ ...current, [item.id]: e.target.value }))}
                />
                <Button type="submit" size="sm">
                  Answer
                </Button>
              </form>
            )}
          </div>
        ))}
      </section>
      <ConfirmDialog
        open={stopOpen}
        title="Stop new connections?"
        body={STOP_CONNECTIONS_BODY}
        confirmLabel="Stop New Connections"
        cancelLabel="Keep connections open"
        busy={busy}
        onClose={() => setStopOpen(false)}
        onConfirm={() => {
          setBusy(true);
          void stopNewProjectConnections(project.id)
            .then(() => {
              toast.push(STOP_CONNECTIONS_TOAST);
              setStopOpen(false);
              return reload();
            })
            .catch((err: Error) => setError(err.message))
            .finally(() => setBusy(false));
        }}
      />
      <ConfirmDialog
        open={cancelOpen}
        title={cancelAction === "delete" ? "Delete this project?" : "Cancel this project?"}
        body={cancelBody}
        confirmLabel={cancelAction === "delete" ? "Delete permanently" : "Cancel project"}
        busy={busy}
        onClose={() => setCancelOpen(false)}
        onConfirm={() => {
          setBusy(true);
          void cancelCustomerProject(project.id, true)
            .then((result) => {
              toast.push(result.action === "deleted" ? "This project was never posted." : CANCEL_PROJECT_TOAST);
              navigate("/app/customer/projects");
            })
            .catch((err: Error) => setError(err.message))
            .finally(() => {
              setBusy(false);
              setCancelOpen(false);
            });
        }}
      />
    </div>
  );
}

export function CompareEstimatesPage() {
  const { projectId = "" } = useParams();
  const toast = useToast();
  const [project, setProject] = useState<Project | null>(null);
  const [missing, setMissing] = useState(false);
  const [rows, setRows] = useState<
    {
      estimate: Awaited<ReturnType<typeof fetchProjectEstimates>>[number];
      items: Awaited<ReturnType<typeof fetchEstimateItems>>;
      contractor: Awaited<ReturnType<typeof fetchPublicContractor>>;
      extras: Awaited<ReturnType<typeof fetchPublicContractorExtras>>;
    }[]
  >([]);
  const [confirmId, setConfirmId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      const proj = await fetchMyCustomerProject(projectId);
      setProject(proj);
      const estimates = liveCustomerEstimates(await fetchProjectEstimates(projectId)).slice(0, 3);
      const detailed = await Promise.all(
        estimates.map(async (estimate) => ({
          estimate,
          items: await fetchEstimateItems(estimate.id),
          contractor: await fetchPublicContractor(estimate.contractor_profile_id),
          extras: await fetchPublicContractorExtras(estimate.contractor_profile_id).catch(() => ({
            services: [],
            areas: [],
            badges: [],
            portfolio: [],
          })),
        })),
      );
      setRows(detailed);
    }
    void load()
      .catch(() => setMissing(true))
      .finally(() => setLoading(false));
  }, [projectId]);

  async function confirm(estimateId: string) {
    setBusy(true);
    setError(null);
    try {
      await selectEstimate(projectId, estimateId);
      toast.push("Pro selected.");
      setConfirmId(null);
      const proj = await fetchMyCustomerProject(projectId);
      setProject(proj);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Selection failed.");
    } finally {
      setBusy(false);
    }
  }

  async function decline(estimateId: string) {
    setBusy(true);
    setError(null);
    try {
      await declineEstimate(estimateId);
      toast.push("Estimate declined.");
      const estimates = liveCustomerEstimates(await fetchProjectEstimates(projectId)).slice(0, 3);
      const detailed = await Promise.all(
        estimates.map(async (estimate) => ({
          estimate,
          items: await fetchEstimateItems(estimate.id),
          contractor: await fetchPublicContractor(estimate.contractor_profile_id),
          extras: await fetchPublicContractorExtras(estimate.contractor_profile_id).catch(() => ({
            services: [],
            areas: [],
            badges: [],
            portfolio: [],
          })),
        })),
      );
      setRows(detailed);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Decline failed.");
    } finally {
      setBusy(false);
    }
  }

  if (loading) return <LoadingState label="Loading estimates" />;
  if (missing) {
    return <NotFoundState title="Project not found" body="You can only compare estimates on your own projects." />;
  }

  return (
    <div className="space-y-6">
      <h1 className="font-display text-4xl font-semibold text-forest-800">Compare estimates</h1>
      <p className="text-ink-700">{COMPARE_INTRO} {CUSTOMER_PAYS_DIRECTLY}</p>
      <FormError message={error} />
      {rows.length === 0 ? <EmptyState title="No estimates yet" body="Submitted estimates will appear here in the order they arrived." /> : null}
      <div className="grid gap-4">
        {rows.map(({ estimate, items, contractor, extras }) => {
          const status = estimate.status as EstimateStatus;
          const outOfDate = estimateNeedsNewSubmission(status);
          const openForChoice = project?.status !== "CONTRACTOR_SELECTED" && project?.status !== "CANCELLED";
          const selectable = canCustomerSelectFrom(status) && openForChoice;
          const declinable = canCustomerDeclineFrom(status) && openForChoice;
          return (
            <article key={estimate.id} className="rounded-3xl border border-forest-800/10 bg-cream-50 p-5">
              <div className="flex items-center gap-3">
                <ContractorAvatar size={56} />
                <h2 className="font-display text-2xl text-forest-800">{contractor?.display_label || "Local pro"}</h2>
              </div>
              <p className="text-sm text-ink-500">
                {outOfDate ? "Needs a new estimate" : customerEstimateStatusLabel(status)}
              </p>
              <p className="text-sm text-ink-700">{contractor?.short_description || "Independent contractor"}</p>
              {extras.badges.length > 0 ? (
                <p className="mt-1 text-xs font-semibold uppercase tracking-[0.14em] text-gold-700">
                  {extras.badges.map((badge) => badge.label).join(" · ")}
                </p>
              ) : null}
              <p className="mt-1 text-xs text-ink-500">{STREET_STAYS_PRIVATE}</p>
              {outOfDate ? (
                <StatusBanner
                  tone="warning"
                  title="This estimate is out of date"
                  body="The job details changed after this price was sent. It does not cover the current scope until the pro sends a new estimate."
                />
              ) : null}
              <p className="mt-3 text-lg font-semibold">{formatUsdFromCents(estimate.total_cents)}</p>
              <ul className="mt-3 space-y-1 text-sm">
                {items.map((item) => (
                  <li key={item.id}>
                    {ESTIMATE_ITEM_KIND_LABELS[(item.kind as EstimateItemKind) ?? "CUSTOM"]}: {item.label} · {item.quantity}{" "}
                    {item.unit_label || "each"} × {formatUsdFromCents(item.unit_cents)} = {formatUsdFromCents(item.line_total_cents)}
                  </li>
                ))}
              </ul>
              <dl className="mt-3 space-y-1 text-sm text-ink-700">
                <div>
                  <dt className="inline font-semibold">Duration: </dt>
                  <dd className="inline">{estimate.duration_hours != null ? `${estimate.duration_hours} hours` : "Not stated"}</dd>
                </div>
                <div>
                  <dt className="inline font-semibold">Available from: </dt>
                  <dd className="inline">{estimate.available_from ?? "Not stated"}</dd>
                </div>
                <div>
                  <dt className="inline font-semibold">Expires: </dt>
                  <dd className="inline">{estimate.valid_until ?? "Not stated"}</dd>
                </div>
              </dl>
              {estimate.notes ? <p className="mt-3 text-sm">{estimate.notes}</p> : null}
              {project?.status === "CONTRACTOR_SELECTED" && project.selected_estimate_id === estimate.id ? (
                <div className="mt-4 space-y-2">
                  <p className="font-semibold text-forest-800">{SELECTED_BOOKING_COPY}</p>
                  {project.selected_booking_id ? (
                    <ButtonLink to={`/app/customer/bookings/${project.selected_booking_id}`} className="min-h-14 w-full">
                      View booking
                    </ButtonLink>
                  ) : null}
                </div>
              ) : project?.status === "CONTRACTOR_SELECTED" ? (
                <p className="mt-4 text-sm text-ink-500">Not selected</p>
              ) : outOfDate ? (
                <p className="mt-4 text-sm text-ink-500">Waiting on a new estimate from this pro.</p>
              ) : (
                <div className="mt-4 space-y-2">
                  <ButtonLink
                    to={`/app/customer/projects/${projectId}/estimates/${estimate.id}`}
                    variant="outline"
                    className="min-h-14 w-full"
                  >
                    View estimate
                  </ButtonLink>
                  {selectable && confirmId === estimate.id ? (
                    <>
                      <p className="text-sm">
                        {SELECT_CONFIRM_BODY}
                      </p>
                      <Button type="button" className="min-h-14 w-full" disabled={busy} onClick={() => void confirm(estimate.id)}>
                        Confirm this pro
                      </Button>
                      <Button type="button" variant="ghost" className="min-h-12 w-full" onClick={() => setConfirmId(null)}>
                        Keep comparing
                      </Button>
                    </>
                  ) : null}
                  {selectable && confirmId !== estimate.id ? (
                    <Button type="button" className="min-h-14 w-full" onClick={() => setConfirmId(estimate.id)}>
                      Select / Hire
                    </Button>
                  ) : null}
                  {declinable ? (
                    <Button type="button" variant="outline" className="min-h-12 w-full" disabled={busy} onClick={() => void decline(estimate.id)}>
                      Decline
                    </Button>
                  ) : null}
                </div>
              )}
            </article>
          );
        })}
      </div>
    </div>
  );
}

export function CustomerEstimateDetailPage() {
  const { projectId = "", estimateId = "" } = useParams();
  const toast = useToast();
  const [project, setProject] = useState<Project | null>(null);
  const [estimate, setEstimate] = useState<Awaited<ReturnType<typeof fetchEstimate>> | null>(null);
  const [items, setItems] = useState<Awaited<ReturnType<typeof fetchEstimateItems>>>([]);
  const [contractor, setContractor] = useState<Awaited<ReturnType<typeof fetchPublicContractor>>>(null);
  const [badges, setBadges] = useState<Awaited<ReturnType<typeof fetchPublicContractorExtras>>["badges"]>([]);
  const [error, setError] = useState<string | null>(null);
  const [missing, setMissing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [confirm, setConfirm] = useState(false);

  useEffect(() => {
    async function load() {
      const proj = await fetchMyCustomerProject(projectId);
      setProject(proj);
      await markEstimateViewed(estimateId, projectId).catch(() => undefined);
      const est = await fetchEstimate(estimateId);
      if (est.project_id !== projectId) throw new Error("Estimate not on this project.");
      setEstimate(est);
      setItems(await fetchEstimateItems(est.id));
      setContractor(await fetchPublicContractor(est.contractor_profile_id));
      const extras = await fetchPublicContractorExtras(est.contractor_profile_id).catch(() => ({
        services: [],
        areas: [],
        badges: [],
        portfolio: [],
      }));
      setBadges(extras.badges);
    }
    void load()
      .catch(() => setMissing(true))
      .then(() => undefined);
  }, [projectId, estimateId]);

  if (missing) {
    return <NotFoundState title="Estimate not found" body="You can only open estimates on your own projects." />;
  }
  if (!estimate || !project) return <LoadingState label="Opening estimate" />;
  const status = estimate.status as EstimateStatus;
  const selectable = canCustomerSelectFrom(status) && project.status !== "CONTRACTOR_SELECTED";
  const declinable = canCustomerDeclineFrom(status) && project.status !== "CONTRACTOR_SELECTED";

  return (
    <div className="space-y-6">
      <ButtonLink to={`/app/customer/projects/${projectId}/compare`} variant="ghost" size="sm">
        Back to comparison
      </ButtonLink>
      <div className="flex items-center gap-4">
        <ContractorAvatar size={72} />
        <h1 className="font-display text-4xl font-semibold text-forest-800">{contractor?.display_label || "Estimate"}</h1>
      </div>
      <p className="text-sm text-ink-500">{STREET_STAYS_PRIVATE}</p>
      <FormError message={error} />
      {badges.length > 0 ? (
        <p className="text-xs font-semibold uppercase tracking-[0.14em] text-gold-700">{badges.map((b) => b.label).join(" · ")}</p>
      ) : (
        <p className="text-xs text-ink-500">No contractor-provided credentials are listed yet.</p>
      )}
      <p className="text-lg font-semibold">{formatUsdFromCents(estimate.total_cents)}</p>
      <ul className="space-y-1 text-sm">
        {items.map((item) => (
          <li key={item.id}>
            {ESTIMATE_ITEM_KIND_LABELS[(item.kind as EstimateItemKind) ?? "CUSTOM"]}: {item.label} · {item.quantity}{" "}
            {item.unit_label || "each"} × {formatUsdFromCents(item.unit_cents)} = {formatUsdFromCents(item.line_total_cents)}
          </li>
        ))}
      </ul>
      <p className="text-sm">Duration: {estimate.duration_hours != null ? `${estimate.duration_hours} hours` : "Not stated"}</p>
      <p className="text-sm">Available from: {estimate.available_from ?? "Not stated"}</p>
      {estimate.notes ? <p className="text-sm">{estimate.notes}</p> : null}
      {selectable ? (
        confirm ? (
          <div className="space-y-2">
            <Button
              type="button"
              className="min-h-14 w-full"
              disabled={busy}
              onClick={() => {
                setBusy(true);
                void selectEstimate(projectId, estimate.id)
                  .then(async () => {
                    toast.push("Pro selected.");
                    const proj = await fetchMyCustomerProject(projectId);
                    setProject(proj);
                    const est = await fetchEstimate(estimate.id);
                    setEstimate(est);
                  })
                  .catch((err: Error) => setError(err.message))
                  .finally(() => setBusy(false));
              }}
            >
              Confirm this pro
            </Button>
            <Button type="button" variant="ghost" className="min-h-12 w-full" onClick={() => setConfirm(false)}>
              Keep reviewing
            </Button>
          </div>
        ) : (
          <Button type="button" className="min-h-14 w-full" onClick={() => setConfirm(true)}>
            Select / Hire
          </Button>
        )
      ) : null}
      {declinable ? (
        <Button
          type="button"
          variant="outline"
          className="min-h-12 w-full"
          disabled={busy}
          onClick={() => {
            setBusy(true);
            void declineEstimate(estimate.id)
              .then(() => toast.push("Estimate declined."))
              .catch((err: Error) => setError(err.message))
              .finally(() => setBusy(false));
          }}
        >
          Decline
        </Button>
      ) : null}
    </div>
  );
}
