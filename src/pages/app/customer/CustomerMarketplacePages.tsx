import { useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { CompletenessBadge } from "../../../components/marketplace/CompletenessBadge";
import { EmptyState } from "../../../components/layout/DashboardShell";
import { Button, ButtonLink } from "../../../components/ui/Button";
import { FormError } from "../../../lib/auth/AuthCard";
import { displayName } from "../../../lib/auth/roles";
import { useAuth } from "../../../lib/auth/useAuth";
import {
  answerEstimateQuestion,
  fetchCustomerProjects,
  fetchEstimateItems,
  fetchEstimateQuestions,
  fetchPrivateLocation,
  fetchProject,
  fetchProjectEstimates,
  fetchPublicContractor,
  selectEstimate,
  TIMING_LABELS,
} from "../../../lib/marketplace/api";
import { formatUsdFromCents } from "../../../lib/marketplace/fees";
import { CUSTOMER_PROJECT_TABS, customerTabForStatus, ESTIMATE_ITEM_KIND_LABELS, type EstimateItemKind, type Project } from "../../../lib/marketplace/types";
import { comparisonDisplayOrder } from "../../../lib/marketplace/flows";
import { useToast } from "../../../hooks/useToast";

export function CustomerHomePage() {
  const { profile } = useAuth();
  const name = profile ? displayName(profile.first_name, profile.last_name, profile.email) : "there";
  return (
    <div className="space-y-6">
      <header>
        <p className="text-[0.72rem] font-semibold uppercase tracking-[0.22em] text-gold-600">Customer</p>
        <h1 className="mt-2 font-display text-4xl font-semibold text-forest-800">Hello, {name}.</h1>
        <p className="mt-3 max-w-xl text-ink-700">
          Post a project, compare estimates, and select one local pro. PPP is not the contractor. No payment in this
          phase.
        </p>
      </header>
      <ButtonLink to="/app/customer/projects/new/wizard">Post a project</ButtonLink>
    </div>
  );
}

export function CustomerProjectsPage() {
  const { profile } = useAuth();
  const [projects, setProjects] = useState<Project[]>([]);
  const [tab, setTab] = useState<(typeof CUSTOMER_PROJECT_TABS)[number]["key"]>("drafts");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!profile) return;
    void fetchCustomerProjects(profile.id).then(setProjects).catch((err: Error) => setError(err.message));
  }, [profile]);

  const counts = useMemo(() => {
    const next: Record<(typeof CUSTOMER_PROJECT_TABS)[number]["key"], number> = {
      drafts: 0,
      open: 0,
      estimates: 0,
      selected: 0,
    };
    for (const project of projects) {
      next[customerTabForStatus(project.status)] += 1;
    }
    return next;
  }, [projects]);

  const filtered = useMemo(() => {
    const match = CUSTOMER_PROJECT_TABS.find((item) => item.key === tab);
    return projects.filter((project) => (match?.statuses as readonly string[] | undefined)?.includes(project.status));
  }, [projects, tab]);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="font-display text-4xl font-semibold text-forest-800">Projects</h1>
        <ButtonLink to="/app/customer/projects/new/wizard" size="sm">
          New
        </ButtonLink>
      </div>
      <FormError message={error} />
      <div className="flex flex-wrap gap-2">
        {CUSTOMER_PROJECT_TABS.map((item) => (
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
      {filtered.length === 0 ? (
        <EmptyState
          title={tab === "drafts" ? "No drafts" : "Nothing here yet"}
          body="Drafts stay here until you post. Open jobs, estimates, and selected contractors sort into their own lists."
        />
      ) : (
        <ul className="space-y-3">
          {filtered.map((project) => (
            <li key={project.id}>
              <Link
                to={
                  project.status === "DRAFT"
                    ? `/app/customer/projects/${project.id}/wizard`
                    : `/app/customer/projects/${project.id}`
                }
                className="block rounded-3xl border border-forest-800/10 bg-cream-50 px-5 py-4"
              >
                <p className="font-semibold text-forest-800">{project.title || "Untitled draft"}</p>
                <p className="mt-1 text-sm text-ink-500">
                  {project.status.replaceAll("_", " ")} · {customerTabForStatus(project.status)}
                </p>
                <div className="mt-2">
                  <CompletenessBadge value={project.completeness} />
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export function CustomerProjectDetailPage() {
  const { projectId = "" } = useParams();
  const [project, setProject] = useState<Project | null>(null);
  const [street, setStreet] = useState<string | null>(null);
  const [questions, setQuestions] = useState<Awaited<ReturnType<typeof fetchEstimateQuestions>>>([]);
  const [error, setError] = useState<string | null>(null);
  const [reply, setReply] = useState<Record<string, string>>({});

  async function reload() {
    const row = await fetchProject(projectId);
    setProject(row);
    const loc = await fetchPrivateLocation(projectId).catch(() => null);
    setStreet(loc?.street_line1 ?? null);
    setQuestions(await fetchEstimateQuestions(projectId));
  }

  useEffect(() => {
    void reload().catch((err: Error) => setError(err.message));
    // Load once per project. reload reads the latest projectId from this render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId]);

  if (!project) return <p className="text-ink-500">{error ?? "Loading…"}</p>;

  return (
    <div className="space-y-6">
      <header>
        <p className="text-[0.72rem] font-semibold uppercase tracking-[0.22em] text-gold-600">{project.status.replaceAll("_", " ")}</p>
        <h1 className="mt-2 font-display text-4xl font-semibold text-forest-800">{project.title}</h1>
        <div className="mt-3">
          <CompletenessBadge value={project.completeness} />
        </div>
      </header>
      <FormError message={error} />
      <section className="rounded-3xl border border-forest-800/10 bg-cream-50 px-5 py-4 text-sm">
        <p>{project.description}</p>
        <p className="mt-3">
          {project.city}, {project.state} {project.zip_code}
        </p>
        <p>Street (protected until you select a pro): {street ?? "—"}</p>
        <p>{project.timing ? TIMING_LABELS[project.timing] : ""}</p>
      </section>
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
      {project.status === "ESTIMATES_AVAILABLE" || project.status === "CONTRACTOR_SELECTED" ? (
        <ButtonLink to={`/app/customer/projects/${project.id}/compare`}>Compare estimates</ButtonLink>
      ) : null}
    </div>
  );
}

export function CompareEstimatesPage() {
  const { projectId = "" } = useParams();
  const toast = useToast();
  const [project, setProject] = useState<Project | null>(null);
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

  useEffect(() => {
    async function load() {
      const proj = await fetchProject(projectId);
      setProject(proj);
      const estimates = comparisonDisplayOrder(await fetchProjectEstimates(projectId));
      const detailed = await Promise.all(
        estimates.map(async (estimate) => ({
          estimate,
          items: await fetchEstimateItems(estimate.id),
          contractor: await fetchPublicContractor(estimate.contractor_profile_id),
        })),
      );
      setRows(detailed);
    }
    void load().catch((err: Error) => setError(err.message));
  }, [projectId]);

  async function confirm(estimateId: string) {
    setBusy(true);
    setError(null);
    try {
      await selectEstimate(projectId, estimateId);
      toast.push("Contractor selected. Payment is not in this phase.");
      setConfirmId(null);
      const proj = await fetchProject(projectId);
      setProject(proj);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Selection failed.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-6">
      <h1 className="font-display text-4xl font-semibold text-forest-800">Compare estimates</h1>
      <p className="text-ink-700">
        Factual comparison only. PPP does not rank a “best” estimate. Selecting a pro does not charge a card.
      </p>
      <FormError message={error} />
      {rows.length === 0 ? <EmptyState title="No estimates yet" body="Submitted estimates will appear here in the order they arrived." /> : null}
      <div className="grid gap-4">
        {rows.map(({ estimate, items, contractor }) => (
          <article key={estimate.id} className="rounded-3xl border border-forest-800/10 bg-cream-50 p-5">
            <h2 className="font-display text-2xl text-forest-800">{contractor?.business_name || "Local pro"}</h2>
            <p className="text-sm text-ink-500">{estimate.status.replaceAll("_", " ")}</p>
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
                <dd className="inline">
                  {estimate.duration_hours != null ? `${estimate.duration_hours} hours` : "Not stated"}
                </dd>
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
            <p className="mt-3 text-xs text-ink-500">Platform fee is a contractor preview only. Nothing is charged in Phase 3.</p>
            {project?.status === "CONTRACTOR_SELECTED" && project.selected_estimate_id === estimate.id ? (
              <p className="mt-4 font-semibold text-forest-800">Selected</p>
            ) : project?.status === "CONTRACTOR_SELECTED" ? (
              <p className="mt-4 text-sm text-ink-500">Not selected</p>
            ) : estimate.status === "SUBMITTED" || estimate.status === "REVISED" ? (
              confirmId === estimate.id ? (
                <div className="mt-4 space-y-2">
                  <p className="text-sm">Confirm this independent contractor? This cannot be undone here. No payment is taken.</p>
                  <Button type="button" className="min-h-14 w-full" disabled={busy} onClick={() => void confirm(estimate.id)}>
                    Confirm this pro
                  </Button>
                  <Button type="button" variant="ghost" className="min-h-12 w-full" onClick={() => setConfirmId(null)}>
                    Cancel
                  </Button>
                </div>
              ) : (
                <Button type="button" className="mt-4 min-h-14 w-full" onClick={() => setConfirmId(estimate.id)}>
                  Select this pro
                </Button>
              )
            ) : null}
          </article>
        ))}
      </div>
    </div>
  );
}

