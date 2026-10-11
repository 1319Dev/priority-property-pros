import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { MiniChart, type ChartSeries } from "../../../components/admin/MiniChart";
import { Button } from "../../../components/ui/Button";
import { ErrorState } from "../../../components/ui/PageState";
import { Skeleton } from "../../../components/ui/Skeleton";
import { CONTACT_LINK_LABEL, CONTACT_PATH } from "../../../data/brand";
import {
  ADMIN_ACTIVITY_PAGE_SIZE,
  fetchAdminDashboardSummary,
  fetchAdminDashboardTrends,
  fetchAdminNeedsAttention,
  fetchAdminRecentActivity,
  type ActivityRow,
  type AttentionItem,
  type DashboardMetric,
  type DashboardSummary,
  type DashboardTrends,
} from "../../../lib/admin/dashboardApi";
import { friendlyAdminError } from "../../../lib/admin/friendlyAdminError";
import { initialIncludeTest, AdminIncludeTestToggle } from "../../../components/admin/shell/AdminPageHeader";
import { collapseActivity } from "../../../lib/admin/activityCollapse";
import { formatCents, formatCentralTimestamp, trendQuery, type TrendPreset } from "../../../lib/admin/money";
import { overviewCardDescription, overviewCardVisible } from "../../../lib/admin/overviewCopy";
import { fetchPaymentsSummary, overlayNetRevenue } from "../../../lib/admin/paymentsApi";

const FOREST = "var(--color-forest-800)";
const GOLD = "var(--color-gold-500)";

type CardSpec = {
  key: string;
  label: string;
  href?: string;
  money?: boolean;
  grossNote?: boolean;
  support?: boolean;
};

const GROUPS: Array<{ title: string; cards: CardSpec[] }> = [
  {
    title: "People",
    cards: [
      { key: "homeowners", label: "Homeowners" },
      { key: "contractors", label: "Contractors" },
      { key: "active_approved_contractors", label: "Active and approved" },
      { key: "awaiting_approval", label: "Awaiting approval", href: "/app/admin/approvals" },
      { key: "identity_review_required", label: "Identity review", href: "/app/admin/approvals" },
    ],
  },
  {
    title: "Projects",
    cards: [
      { key: "projects_posted", label: "Projects posted" },
      { key: "projects_open", label: "Open projects" },
      { key: "awaiting_estimates", label: "Awaiting estimates" },
      { key: "marked_hired", label: "Marked hired" },
      { key: "completed", label: "Completed" },
    ],
  },
  {
    title: "Money",
    cards: [
      { key: "revenue_month_cents", label: "Gross revenue this month", money: true, grossNote: true },
      { key: "revenue_lifetime_cents", label: "Gross revenue, lifetime", money: true, grossNote: true },
      { key: "revenue_net_cents", label: "Net revenue", money: true, href: "/app/admin/payments" },
      { key: "checkouts_completed", label: "Checkouts completed" },
      { key: "checkouts_expired", label: "Checkouts expired" },
      { key: "checkouts_open", label: "Checkouts still open" },
      { key: "card_declines", label: "Card declines" },
    ],
  },
  {
    title: "Trust",
    cards: [
      { key: "pending_photo_approvals", label: "Photos to review", href: "/app/admin/approvals" },
      { key: "platform_reviews_pending", label: "Platform reviews", href: "/app/admin/reviews" },
      { key: "content_reports_30d", label: "Reports, last 30 days" },
      { key: "disputed_bookings", label: "Disputed bookings" },
      { key: "support_tickets", label: "Support tickets" },
    ],
  },
];

function readError(error: unknown, fallback: string): string {
  if (error instanceof Error && error.message.trim()) {
    return friendlyAdminError({ message: error.message }, fallback);
  }
  if (error && typeof error === "object" && ("message" in error || "code" in error)) {
    return friendlyAdminError(error as { message?: string; code?: string }, fallback);
  }
  return fallback;
}

function metricText(metric: DashboardMetric | undefined, money: boolean): string {
  if (!metric || metric.status === "unavailable" || metric.value == null) return "—";
  return money ? formatCents(metric.value) : metric.value.toLocaleString("en-US");
}

function bucketLabel(start: string, granularity: string): string {
  if (granularity === "month") return start.slice(0, 7);
  return start.slice(5);
}

export function AdminOverviewPage() {
  const [includeTest, setIncludeTest] = useState(initialIncludeTest);
  const [preset, setPreset] = useState<TrendPreset>("30d");
  const [reloadKey, setReloadKey] = useState(0);
  const [loading, setLoading] = useState(true);
  const [summary, setSummary] = useState<DashboardSummary | null>(null);
  const [attention, setAttention] = useState<AttentionItem[] | null>(null);
  const [rows, setRows] = useState<ActivityRow[] | null>(null);
  const [hasMore, setHasMore] = useState(false);
  const [trends, setTrends] = useState<DashboardTrends | null>(null);
  const [summaryFailed, setSummaryFailed] = useState(false);
  const [activityFailed, setActivityFailed] = useState(false);
  const [trendsFailed, setTrendsFailed] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loadingMore, setLoadingMore] = useState(false);
  const generation = useRef(0);
  const loaded = useRef({ summary: false, attention: false, rows: false, trends: false });
  loaded.current = {
    summary: summary != null,
    attention: attention != null,
    rows: rows != null,
    trends: trends != null,
  };

  useEffect(() => {
    const onFocus = () => setReloadKey((value) => value + 1);
    window.addEventListener("focus", onFocus);
    return () => window.removeEventListener("focus", onFocus);
  }, []);

  useEffect(() => {
    let cancelled = false;
    const nextGeneration = generation.current + 1;
    generation.current = nextGeneration;
    setLoading(true);
    setError(null);
    const range = trendQuery(preset);
    void Promise.allSettled([
      fetchAdminDashboardSummary(includeTest),
      fetchAdminNeedsAttention(includeTest),
      fetchAdminRecentActivity({ limit: ADMIN_ACTIVITY_PAGE_SIZE, cursor: null, includeTest }),
      fetchAdminDashboardTrends({ ...range, includeTest }),
    ]).then(([summaryResult, attentionResult, activityResult, trendsResult]) => {
      if (cancelled) return;
      const problems: string[] = [];
      if (summaryResult.status === "fulfilled") {
        setSummary(summaryResult.value);
        setSummaryFailed(false);
        void fetchPaymentsSummary(includeTest)
          .then((money) => {
            if (cancelled || generation.current !== nextGeneration) return;
            setSummary((current) => overlayNetRevenue(current, money));
          })
          .catch(() => undefined);
      } else {
        if (!loaded.current.summary) {
          setSummary(null);
          setSummaryFailed(true);
        }
        problems.push(readError(summaryResult.reason, "Could not load the overview."));
      }
      if (attentionResult.status === "fulfilled") setAttention(attentionResult.value.items);
      else {
        if (!loaded.current.attention) setAttention(null);
        problems.push(readError(attentionResult.reason, "Could not load what needs attention."));
      }
      if (activityResult.status === "fulfilled") {
        setRows(activityResult.value);
        setHasMore(activityResult.value.length === ADMIN_ACTIVITY_PAGE_SIZE);
        setActivityFailed(false);
      } else {
        if (!loaded.current.rows) {
          setRows(null);
          setHasMore(false);
          setActivityFailed(true);
        }
        problems.push(readError(activityResult.reason, "Could not load recent activity."));
      }
      if (trendsResult.status === "fulfilled") {
        setTrends(trendsResult.value);
        setTrendsFailed(false);
      } else {
        if (!loaded.current.trends) {
          setTrends(null);
          setTrendsFailed(true);
        }
        problems.push(readError(trendsResult.reason, "Could not load the trends."));
      }
      setError(problems.length > 0 ? [...new Set(problems)].join(" ") : null);
      setLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, [includeTest, preset, reloadKey]);

  async function loadMore() {
    const cursor = rows?.[rows.length - 1]?.cursor;
    if (!cursor || loadingMore) return;
    const gen = generation.current;
    setLoadingMore(true);
    try {
      const next = await fetchAdminRecentActivity({
        limit: ADMIN_ACTIVITY_PAGE_SIZE,
        cursor,
        includeTest,
      });
      if (gen !== generation.current) return;
      setRows((current) => [...(current ?? []), ...next]);
      setHasMore(next.length === ADMIN_ACTIVITY_PAGE_SIZE);
    } catch (reason) {
      if (gen !== generation.current) return;
      setError(readError(reason, "Could not load more activity."));
    } finally {
      if (gen === generation.current) setLoadingMore(false);
    }
  }

  return (
    <div className="min-w-0 space-y-8">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div className="min-w-0">
          <p className="text-xs font-semibold uppercase tracking-[0.22em] text-gold-600">Admin</p>
          <h1 className="mt-2 font-display text-4xl font-semibold text-forest-800">Overview</h1>
          <p className="mt-3 max-w-2xl text-sm text-ink-700">
            Counts exclude accounts flagged TEST unless you include them. Owner accounts stay in the counts.
            {summary?.generatedAt ? ` Updated ${formatCentralTimestamp(summary.generatedAt)}.` : ""}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <AdminIncludeTestToggle checked={includeTest} onChange={setIncludeTest} />
          <Button type="button" variant="outline" size="sm" onClick={() => setReloadKey((value) => value + 1)}>
            Refresh
          </Button>
        </div>
      </header>

      {error ? <ErrorState message={error} onRetry={() => setReloadKey((value) => value + 1)} /> : null}

      {loading && !summary && !summaryFailed ? (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3" aria-hidden="true">
          {Array.from({ length: 6 }).map((_, index) => (
            <Skeleton key={index} className="h-28" />
          ))}
        </div>
      ) : (
        GROUPS.map((group) => {
          const cards = group.cards.filter((card) => overviewCardVisible(summary?.metrics[card.key], summaryFailed));
          if (cards.length === 0) return null;
          return (
            <section key={group.title} className="space-y-3">
              <h2 className="font-display text-2xl text-forest-800">{group.title}</h2>
              {group.title === "Money" ? (
                <p className="max-w-2xl text-sm text-ink-700">
                  Money here is the $9.99 activation and $4.99 Connect fees only, before Stripe fees. Homeowners pay
                  pros directly, so job payments are not included.
                </p>
              ) : null}
              <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                {cards.map((card) => (
                  <MetricCard
                    key={card.key}
                    card={card}
                    metric={summary?.metrics[card.key]}
                    failed={summaryFailed}
                  />
                ))}
              </div>
              {group.title === "Trust" ? (
                <p className="max-w-2xl text-sm text-ink-700">
                  Support requests arrive by email from the{" "}
                  <Link className="font-semibold text-forest-800 underline" to={CONTACT_PATH}>
                    {CONTACT_LINK_LABEL}
                  </Link>{" "}
                  page.
                </p>
              ) : null}
            </section>
          );
        })
      )}

      <section className="space-y-3">
        <h2 className="font-display text-2xl text-forest-800">Needs your attention</h2>
        {attention == null ? (
          <p className="text-sm text-ink-700">—</p>
        ) : attention.length === 0 ? (
          <p className="rounded-3xl border border-dashed border-forest-800/20 bg-cream-100 px-5 py-6 text-sm text-ink-700">
            Nothing needs a decision right now.
          </p>
        ) : (
          <ul className="space-y-2">
            {attention.map((item) => (
              <li key={item.kind} className="rounded-3xl border border-forest-800/10 bg-cream-50 px-4 py-3">
                {item.link ? (
                  <Link to={item.link} className="font-semibold text-forest-800 underline">
                    {item.count.toLocaleString("en-US")} · {item.note}
                  </Link>
                ) : (
                  <p className="text-sm text-ink-700">
                    <span className="font-semibold text-forest-800">{item.count.toLocaleString("en-US")}</span>
                    {" · "}
                    {item.note}
                  </p>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="space-y-3">
        <h2 className="font-display text-2xl text-forest-800">Recent activity</h2>
        {activityFailed || rows == null ? (
          <p className="text-sm text-ink-700">—</p>
        ) : rows.length === 0 ? (
          <p className="rounded-3xl border border-dashed border-forest-800/20 bg-cream-100 px-5 py-6 text-sm text-ink-700">
            No activity yet.
          </p>
        ) : (
          <ul className="space-y-2">
            {collapseActivity(rows).map((row) => (
              <li key={row.cursor} className="rounded-3xl border border-forest-800/10 px-4 py-3">
                <p className="font-semibold text-forest-800">
                  {row.label}
                  {row.count > 1 ? ` · ${row.count}` : ""}
                </p>
                <p className="text-sm text-ink-500">{formatCentralTimestamp(row.occurredAt)}</p>
                <p className="mt-1 text-sm text-ink-700">
                  {row.jobReference ? (
                    <Link className="font-semibold text-forest-800 underline" to={`/app/admin/bookings?ref=${row.jobReference}`}>
                      {row.jobReference}
                    </Link>
                  ) : null}
                  {row.jobReference ? " · " : null}
                  {row.subjectLabel}
                  {row.ownerActivity ? (
                    <span className="ml-2 inline-flex min-h-6 items-center rounded-full bg-gold-500/20 px-2 text-xs font-semibold uppercase tracking-[0.12em] text-forest-800">
                      Owner
                    </span>
                  ) : null}
                </p>
              </li>
            ))}
          </ul>
        )}
        {hasMore ? (
          <Button type="button" variant="outline" size="sm" disabled={loadingMore} onClick={() => void loadMore()}>
            {loadingMore ? "Loading…" : "Load more"}
          </Button>
        ) : null}
      </section>

      <section className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="font-display text-2xl text-forest-800">Trends</h2>
          <div className="flex flex-wrap gap-2" role="group" aria-label="Trend range">
            {(
              [
                ["7d", "7 days"],
                ["30d", "30 days"],
                ["12m", "12 months"],
              ] as const
            ).map(([value, label]) => (
              <button
                key={value}
                type="button"
                aria-pressed={preset === value}
                className={`min-h-11 rounded-full px-4 text-sm font-semibold ${
                  preset === value ? "bg-forest-800 text-cream-50" : "text-forest-800 hover:bg-cream-100"
                }`}
                onClick={() => setPreset(value)}
              >
                {label}
              </button>
            ))}
          </div>
        </div>
        {trendsFailed || trends == null ? (
          <p className="text-sm text-ink-700">—</p>
        ) : (
          <div className="grid gap-3 lg:grid-cols-2">
            <MiniChart
              title="Gross revenue"
              description="Activation and Connect fees paid in each period, before Stripe fees."
              labels={trends.buckets.map((bucket) => bucketLabel(bucket.start, trends.granularity))}
              series={[
                {
                  id: "revenue",
                  label: "Gross revenue",
                  color: FOREST,
                  values: trends.buckets.map((bucket) => bucket.revenueCents),
                  formatValue: (value) => formatCents(value),
                },
              ]}
            />
            <MiniChart
              title="Registrations"
              description="New homeowner and contractor profiles in each period."
              labels={trends.buckets.map((bucket) => bucketLabel(bucket.start, trends.granularity))}
              series={[
                series("customers", "Homeowners", FOREST, trends, "signupsCustomer"),
                series("contractors", "Contractors", GOLD, trends, "signupsContractor"),
              ]}
            />
            <MiniChart
              title="Homeowner and contractor growth"
              description="Running totals through the end of each period."
              labels={trends.buckets.map((bucket) => bucketLabel(bucket.start, trends.granularity))}
              series={[
                series("homeowners", "Homeowners", FOREST, trends, "homeownersCumulative"),
                series("contractors-total", "Contractors", GOLD, trends, "contractorsCumulative"),
              ]}
            />
            <MiniChart
              title="Projects posted and completed"
              description="Projects posted, and bookings marked completed, in each period."
              labels={trends.buckets.map((bucket) => bucketLabel(bucket.start, trends.granularity))}
              series={[
                series("posted", "Posted", FOREST, trends, "projectsPosted"),
                series("completed", "Completed", GOLD, trends, "completions"),
              ]}
            />
            <MiniChart
              title="Checkouts completed and expired"
              description="Completed means paid. Expired means someone opened checkout and left without paying."
              labels={trends.buckets.map((bucket) => bucketLabel(bucket.start, trends.granularity))}
              series={[
                series("completed-checkouts", "Completed", FOREST, trends, "checkoutsCompleted"),
                series("expired-checkouts", "Expired", GOLD, trends, "checkoutsExpired"),
              ]}
            />
          </div>
        )}
      </section>
    </div>
  );
}

function series(
  id: string,
  label: string,
  color: string,
  trends: DashboardTrends,
  key: keyof DashboardTrends["buckets"][number],
): ChartSeries {
  return {
    id,
    label,
    color,
    values: trends.buckets.map((bucket) => {
      const value = bucket[key];
      return typeof value === "number" ? value : null;
    }),
  };
}

function MetricCard({
  card,
  metric,
  failed,
}: {
  card: CardSpec;
  metric: DashboardMetric | undefined;
  failed: boolean;
}) {
  const text = failed ? "—" : metricText(metric, Boolean(card.money));
  const description = overviewCardDescription(card.key);
  const body = (
    <>
      <p className="text-xs font-semibold uppercase tracking-[0.16em] text-gold-700">{card.label}</p>
      <p className="mt-2 font-display text-3xl font-semibold text-forest-800">{text}</p>
      {description ? <p className="mt-1 text-sm text-ink-700">{description}</p> : null}
      {card.grossNote && text !== "—" ? (
        <p className="mt-1 text-xs text-ink-500">Gross, before Stripe fees</p>
      ) : null}
      {card.key === "revenue_net_cents" && metric?.status === "available" ? (
        <p className="mt-1 text-xs text-ink-500">Succeeded live fees minus stored refunds</p>
      ) : null}
      {card.support ? (
        <Link className="mt-2 inline-flex min-h-11 items-center font-semibold text-forest-800 underline" to={CONTACT_PATH}>
          {CONTACT_LINK_LABEL}
        </Link>
      ) : null}
    </>
  );
  const className = "block min-w-0 rounded-3xl border border-forest-800/10 bg-cream-50 px-4 py-4";
  const canLink = Boolean(card.href) && !failed && metric?.status === "available";
  if (canLink && card.href) {
    return (
      <Link to={card.href} className={`${className} hover:border-forest-800`}>
        {body}
      </Link>
    );
  }
  return <div className={className}>{body}</div>;
}
