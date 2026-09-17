import { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { CompletenessBadge } from "../../../components/marketplace/CompletenessBadge";
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
  fetchCustomerProjects,
  fetchEstimateItems,
  fetchEstimateQuestions,
  fetchMyBookings,
  fetchMyCustomerProject,
  fetchPrivateLocation,
  fetchProjectEstimates,
  fetchProjectNotices,
  fetchPublicContractor,
  selectEstimate,
  TIMING_LABELS,
} from "../../../lib/marketplace/api";
import { computeMarketplaceFee } from "../../../lib/marketplace/feeEngine";
import { formatUsdFromCents } from "../../../lib/marketplace/fees";
import { paymentsComingSoonCopy } from "../../../lib/marketplace/bookings";
import { CUSTOMER_DASHBOARD_PRICING_NOTE } from "../../../data/pricing";
import { ESTIMATE_ITEM_KIND_LABELS, type Booking, type EstimateItemKind, type Project } from "../../../lib/marketplace/types";
import { comparisonDisplayOrder } from "../../../lib/marketplace/flows";
import { planDeleteOrCancel } from "../../../lib/marketplace/lifecycle";
import {
  CUSTOMER_DASHBOARD_TABS,
  customerLifecycleLabel,
  customerLifecycleState,
  customerNextActions,
  type CustomerDashboardTab,
} from "../../../lib/marketplace/statusLabels";
import { estimateNeedsNewSubmission } from "../../../lib/marketplace/privacy";
import { useToast } from "../../../hooks/useToast";

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
  const recent = projects.slice(0, 4);

  return (
    <div className="space-y-6">
      <header>
        <HumanStatus label="Customer" />
        <h1 className="mt-2 font-display text-4xl font-semibold text-forest-800">Hello, {name}.</h1>
        <p className="mt-3 max-w-xl text-ink-700">
          Post a project, compare estimates, and choose one local pro. Selecting a pro starts a booking.
          {` ${CUSTOMER_DASHBOARD_PRICING_NOTE}`}
          {` ${paymentsComingSoonCopy()}`}
        </p>
      </header>
      <ButtonLink to="/app/customer/projects/new/wizard" className="min-h-14">
        Post a project
      </ButtonLink>
      {error ? <ErrorState message={error} /> : null}
      {loading ? <LoadingState /> : null}
      {!loading && recent.length === 0 ? (
        <EmptyState
          title="No projects yet"
          body="Start a draft when you know what needs doing. Only you will see it. There is no monthly homeowner subscription and no PPP marketplace fee when you hire."
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
          });
          return (
            <li key={project.id} className="rounded-3xl border border-forest-800/10 bg-cream-50 px-5 py-4">
              <HumanStatus label={customerLifecycleLabel(project.status, booking?.status ?? null)} />
              <p className="mt-2 font-semibold text-forest-800">{project.title || "Untitled draft"}</p>
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

  const classified = useMemo(
    () =>
      projects.map((project) => {
        const booking = map.get(project.id);
        return {
          project,
          booking,
          state: customerLifecycleState(project.status, booking?.status ?? null),
        };
      }),
    [projects, map],
  );

  const counts = useMemo(() => {
    const next: Record<CustomerDashboardTab, number> = { drafts: 0, active: 0, completed: 0, cancelled: 0 };
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
          title={tab === "drafts" ? "No drafts" : tab === "cancelled" ? "No cancelled projects" : "Nothing here yet"}
          body="Only your projects appear here. Drafts, active jobs, completed work, and cancelled history stay in this account."
        />
      ) : (
        <ul className="space-y-3">
          {filtered.map(({ project, booking, state }) => {
            const actions = customerNextActions({
              projectId: project.id,
              projectStatus: project.status,
              bookingId: booking?.id ?? project.selected_booking_id,
              bookingStatus: booking?.status ?? null,
            });
            return (
              <li key={project.id} className="rounded-3xl border border-forest-800/10 bg-cream-50 px-5 py-4">
                <HumanStatus label={customerLifecycleLabel(project.status, booking?.status ?? null)} />
                <p className="mt-2 font-semibold text-forest-800">{project.title || "Untitled draft"}</p>
                {state === "cancelled" ? <p className="mt-1 text-sm font-semibold uppercase tracking-wide text-ink-500">Cancelled</p> : null}
                <div className="mt-2">
                  <CompletenessBadge value={project.completeness} />
                </div>
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
  const [missing, setMissing] = useState(false);
  const [street, setStreet] = useState<string | null>(null);
  const [questions, setQuestions] = useState<Awaited<ReturnType<typeof fetchEstimateQuestions>>>([]);
  const [notices, setNotices] = useState<Awaited<ReturnType<typeof fetchProjectNotices>>>([]);
  const [error, setError] = useState<string | null>(null);
  const [reply, setReply] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [cancelOpen, setCancelOpen] = useState(false);
  const [cancelBody, setCancelBody] = useState("");
  const [cancelAction, setCancelAction] = useState<"delete" | "cancel">("cancel");
  const [busy, setBusy] = useState(false);

  async function reload() {
    const row = await fetchMyCustomerProject(projectId);
    setProject(row);
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
        <HumanStatus label={customerLifecycleLabel(project.status)} />
        <h1 className="mt-2 font-display text-4xl font-semibold text-forest-800">{project.title || "Untitled draft"}</h1>
        <div className="mt-3">
          <CompletenessBadge value={project.completeness} />
        </div>
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
        <p className="mt-3">
          {project.city}, {project.state} {project.zip_code}
        </p>
        <p>Street (private until a booking is confirmed): {street ?? "—"}</p>
        <p>{project.timing ? TIMING_LABELS[project.timing] : ""}</p>
      </section>
      <div className="flex min-w-0 flex-col gap-2">
        {project.status === "DRAFT" ? (
          <ButtonLink to={`/app/customer/projects/${project.id}/wizard`} className="min-h-14 w-full">
            Finish project
          </ButtonLink>
        ) : null}
        {canEdit ? (
          <ButtonLink to={`/app/customer/projects/${project.id}/edit`} className="min-h-14 w-full">
            Edit
          </ButtonLink>
        ) : null}
        {project.status === "ESTIMATES_AVAILABLE" || project.status === "CONTRACTOR_SELECTED" ? (
          <ButtonLink to={`/app/customer/projects/${project.id}/compare`} variant="outline" className="min-h-14 w-full">
            Review estimates
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
            {project.status === "DRAFT" ? "Delete draft" : "Cancel project"}
          </Button>
        ) : null}
      </div>
      <section className="space-y-3">
        <h2 className="font-display text-2xl text-forest-800">Questions from contractors</h2>
        {questions.length === 0 ? <p className="text-ink-500">No questions yet.</p> : null}
        {questions.map((item) => (
          <div key={item.id} className="rounded-2xl border border-forest-800/10 px-4 py-3">
            <p className="font-semibold">{item.prompt}</p>
            {item.answer_text ? (
              <p className="mt-2 text-sm text-ink-700">{item.answer_text}</p>
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
              toast.push(result.action === "deleted" ? "Draft deleted." : "Project cancelled.");
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
      const estimates = comparisonDisplayOrder(await fetchProjectEstimates(projectId)).slice(0, 3);
      const detailed = await Promise.all(
        estimates.map(async (estimate) => ({
          estimate,
          items: await fetchEstimateItems(estimate.id),
          contractor: await fetchPublicContractor(estimate.contractor_profile_id),
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
      toast.push(paymentsComingSoonCopy());
      setConfirmId(null);
      const proj = await fetchMyCustomerProject(projectId);
      setProject(proj);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Selection failed.");
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
      <p className="text-ink-700">
        Factual comparison only. PPP does not rank a “best” estimate. Up to three local independents can price the job.
        Selecting a pro starts a pending booking. It does not charge a card and does not share your exact address yet.
      </p>
      <FormError message={error} />
      {rows.length === 0 ? <EmptyState title="No estimates yet" body="Submitted estimates will appear here in the order they arrived." /> : null}
      <div className="grid gap-4">
        {rows.map(({ estimate, items, contractor }) => {
          const outOfDate = estimateNeedsNewSubmission(estimate.status as "SUPERSEDED" | "EXPIRED" | "SUBMITTED");
          return (
            <article key={estimate.id} className="rounded-3xl border border-forest-800/10 bg-cream-50 p-5">
              <h2 className="font-display text-2xl text-forest-800">{contractor?.business_name || "Local pro"}</h2>
              <p className="text-sm text-ink-500">
                {outOfDate ? "Needs a new estimate" : estimate.status === "ACCEPTED" ? "Selected" : "Submitted"}
              </p>
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
              {(() => {
                const bookingFee = computeMarketplaceFee({ amount_cents: estimate.total_cents, kind: "ORIGINAL" });
                return (
                  <p className="mt-3 text-xs text-ink-500">
                    Marketplace fee preview: {formatUsdFromCents(bookingFee.fee_cents)}. {paymentsComingSoonCopy()}
                  </p>
                );
              })()}
              {project?.status === "CONTRACTOR_SELECTED" && project.selected_estimate_id === estimate.id ? (
                <div className="mt-4 space-y-2">
                  <p className="font-semibold text-forest-800">Selected — booking is waiting</p>
                  <p className="text-sm">{paymentsComingSoonCopy()}</p>
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
              ) : estimate.status === "SUBMITTED" || estimate.status === "REVISED" ? (
                confirmId === estimate.id ? (
                  <div className="mt-4 space-y-2">
                    <p className="text-sm">
                      Confirm this independent contractor? This starts a pending booking. No payment is taken and your exact
                      address stays private.
                    </p>
                    <Button type="button" className="min-h-14 w-full" disabled={busy} onClick={() => void confirm(estimate.id)}>
                      Confirm this pro
                    </Button>
                    <Button type="button" variant="ghost" className="min-h-12 w-full" onClick={() => setConfirmId(null)}>
                      Keep comparing
                    </Button>
                  </div>
                ) : (
                  <Button type="button" className="mt-4 min-h-14 w-full" onClick={() => setConfirmId(estimate.id)}>
                    Select this pro
                  </Button>
                )
              ) : null}
            </article>
          );
        })}
      </div>
    </div>
  );
}
