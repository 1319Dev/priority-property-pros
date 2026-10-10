import { getSupabaseClient } from "../supabase/client";
import { friendlyAdminError } from "./friendlyAdminError";

export const ADMIN_ACTIVITY_PAGE_SIZE = 25;

export type DashboardMetric = {
  value: number | null;
  status: "available" | "unavailable";
  definition: string;
};

export type DashboardSummary = {
  generatedAt: string | null;
  includeTest: boolean;
  timezone: string;
  revenueNote: string;
  metrics: Record<string, DashboardMetric>;
};

export type AttentionItem = {
  kind: string;
  count: number;
  severity: string;
  link: string | null;
  note: string;
};

export type AttentionList = {
  generatedAt: string | null;
  includeTest: boolean;
  mfa: string;
  items: AttentionItem[];
};

export type ActivityRow = {
  occurredAt: string;
  kind: string;
  label: string;
  jobReference: string | null;
  subjectLabel: string;
  ownerActivity: boolean;
  cursor: string;
};

export type TrendBucket = {
  start: string;
  revenueCents: number | null;
  signupsCustomer: number | null;
  signupsContractor: number | null;
  homeownersCumulative: number | null;
  contractorsCumulative: number | null;
  projectsPosted: number | null;
  hires: number | null;
  completions: number | null;
  checkoutsCompleted: number | null;
  checkoutsExpired: number | null;
};

export type DashboardTrends = {
  granularity: string;
  from: string;
  to: string;
  revenueNote: string;
  checkoutNote: string;
  cardDeclinesUnavailable: boolean;
  buckets: TrendBucket[];
};

function fail(error: { message?: string; code?: string } | null, fallback: string): never {
  throw new Error(friendlyAdminError(error, fallback));
}

function client() {
  const supabase = getSupabaseClient();
  if (!supabase) throw new Error("Supabase is not configured yet.");
  return supabase;
}

function readCount(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return Math.trunc(value);
  if (typeof value === "string" && value.trim() !== "") {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return Math.trunc(parsed);
  }
  return null;
}

function readText(value: unknown): string | null {
  return typeof value === "string" && value.trim() !== "" ? value : null;
}

export function parseDashboardSummary(data: unknown): DashboardSummary {
  if (!data || typeof data !== "object") fail(null, "Could not read the dashboard.");
  const row = data as Record<string, unknown>;
  const metricsRaw = row.metrics;
  if (!metricsRaw || typeof metricsRaw !== "object" || Array.isArray(metricsRaw)) {
    fail(null, "Could not read the dashboard.");
  }
  const metrics: Record<string, DashboardMetric> = {};
  for (const [key, value] of Object.entries(metricsRaw as Record<string, unknown>)) {
    if (!value || typeof value !== "object") continue;
    const metric = value as Record<string, unknown>;
    const definition = typeof metric.definition === "string" ? metric.definition : "";
    if (metric.status === "unavailable") {
      metrics[key] = { value: null, status: "unavailable", definition };
      continue;
    }
    if (metric.status !== "available") continue;
    metrics[key] = { value: readCount(metric.value), status: "available", definition };
  }
  return {
    generatedAt: readText(row.generated_at),
    includeTest: row.include_test === true,
    timezone: readText(row.timezone) ?? "America/Chicago",
    revenueNote: readText(row.revenue_note) ?? "",
    metrics,
  };
}

function adminPath(value: unknown): string | null {
  if (typeof value !== "string") return null;
  if (!value.startsWith("/app/admin")) return null;
  return value;
}

export function parseAttention(data: unknown): AttentionList {
  if (!data || typeof data !== "object") fail(null, "Could not read what needs attention.");
  const row = data as Record<string, unknown>;
  const itemsRaw = Array.isArray(row.items) ? row.items : [];
  const items: AttentionItem[] = [];
  for (const value of itemsRaw) {
    if (!value || typeof value !== "object") continue;
    const item = value as Record<string, unknown>;
    const count = readCount(item.count);
    const note = readText(item.note);
    const kind = readText(item.kind);
    if (count == null || count <= 0 || !note || !kind) continue;
    items.push({
      kind,
      count,
      severity: readText(item.severity) ?? "medium",
      link: adminPath(item.link),
      note,
    });
  }
  return {
    generatedAt: readText(row.generated_at),
    includeTest: row.include_test === true,
    mfa: readText(row.mfa) ?? "unavailable",
    items,
  };
}

export function parseActivity(data: unknown): ActivityRow[] {
  if (!Array.isArray(data)) return [];
  const rows: ActivityRow[] = [];
  for (const value of data) {
    if (!value || typeof value !== "object") continue;
    const row = value as Record<string, unknown>;
    const label = readText(row.label);
    const cursor = readText(row.cursor);
    const occurredAt = readText(row.occurred_at);
    const kind = readText(row.kind);
    if (!label || !cursor || !occurredAt || !kind) continue;
    const reference = readText(row.job_reference);
    rows.push({
      occurredAt,
      kind,
      label,
      jobReference: reference && /^PPP-\d+$/.test(reference) ? reference : null,
      subjectLabel: readText(row.subject_label) ?? "Member",
      ownerActivity: row.owner_activity === true,
      cursor,
    });
  }
  return rows;
}

function bucketNumber(row: Record<string, unknown>, key: string): number | null {
  if (!(key in row)) return null;
  return readCount(row[key]);
}

export function parseTrends(data: unknown): DashboardTrends {
  if (!data || typeof data !== "object") fail(null, "Could not read the trends.");
  const row = data as Record<string, unknown>;
  const bucketsRaw = Array.isArray(row.buckets) ? row.buckets : null;
  if (!bucketsRaw) fail(null, "Could not read the trends.");
  const declines = row.card_declines;
  const declinesUnavailable =
    !declines ||
    typeof declines !== "object" ||
    (declines as Record<string, unknown>).status !== "available";
  const buckets: TrendBucket[] = [];
  for (const value of bucketsRaw) {
    if (!value || typeof value !== "object") continue;
    const bucket = value as Record<string, unknown>;
    const start = readText(bucket.start);
    if (!start) continue;
    buckets.push({
      start,
      revenueCents: bucketNumber(bucket, "revenue_cents"),
      signupsCustomer: bucketNumber(bucket, "signups_customer"),
      signupsContractor: bucketNumber(bucket, "signups_contractor"),
      homeownersCumulative: bucketNumber(bucket, "homeowners_cumulative"),
      contractorsCumulative: bucketNumber(bucket, "contractors_cumulative"),
      projectsPosted: bucketNumber(bucket, "projects_posted"),
      hires: bucketNumber(bucket, "hires"),
      completions: bucketNumber(bucket, "completions"),
      checkoutsCompleted: bucketNumber(bucket, "checkouts_completed"),
      checkoutsExpired: bucketNumber(bucket, "checkouts_expired"),
    });
  }
  return {
    granularity: readText(row.granularity) ?? "",
    from: readText(row.from) ?? "",
    to: readText(row.to) ?? "",
    revenueNote: readText(row.revenue_note) ?? "",
    checkoutNote: readText(row.checkout_note) ?? "",
    cardDeclinesUnavailable: declinesUnavailable,
    buckets,
  };
}

export async function fetchAdminDashboardSummary(includeTest: boolean): Promise<DashboardSummary> {
  const { data, error } = await client().rpc("admin_dashboard_summary", { p_include_test: includeTest });
  if (error) fail(error, "Could not load the overview.");
  return parseDashboardSummary(data);
}

export async function fetchAdminNeedsAttention(includeTest: boolean): Promise<AttentionList> {
  const { data, error } = await client().rpc("admin_needs_attention", { p_include_test: includeTest });
  if (error) fail(error, "Could not load what needs attention.");
  return parseAttention(data);
}

export async function fetchAdminRecentActivity(input: {
  limit: number;
  cursor: string | null;
  includeTest: boolean;
}): Promise<ActivityRow[]> {
  const { data, error } = await client().rpc("admin_recent_activity", {
    p_limit: input.limit,
    p_cursor: input.cursor,
    p_include_test: input.includeTest,
  });
  if (error) fail(error, "Could not load recent activity.");
  return parseActivity(data);
}

export async function fetchAdminDashboardTrends(input: {
  granularity: "day" | "week" | "month";
  from: string;
  to: string;
  includeTest: boolean;
}): Promise<DashboardTrends> {
  const { data, error } = await client().rpc("admin_dashboard_trends", {
    p_granularity: input.granularity,
    p_from: input.from,
    p_to: input.to,
    p_include_test: input.includeTest,
  });
  if (error) fail(error, "Could not load the trends.");
  return parseTrends(data);
}
