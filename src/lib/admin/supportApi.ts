import { getSupabaseClient } from "../supabase/client";
import { friendlyAdminError } from "./friendlyAdminError";

export type SupportQueue = "open" | "assigned" | "waiting" | "resolved" | "closed" | "all" | "mine";
export type SupportAvailability = "available" | "away" | "offline";

export type SupportQueueRow = {
  id: string;
  reference: string | null;
  status: string;
  priority: string;
  assignedAdminId: string | null;
  createdAt: string;
  lastMessageAt: string | null;
  role: string | null;
  displayName: string | null;
  guest: boolean;
};

export type SupportQueuePage = {
  queue: SupportQueue;
  availability: SupportAvailability;
  rows: SupportQueueRow[];
};

export type SupportMessage = {
  id: string;
  role: string;
  visibility: "public" | "internal";
  body: string;
  createdAt: string;
};

export type SupportAccount = {
  profileId: string | null;
  role: string | null;
  accountStatus: string | null;
  firstName: string | null;
  lastName: string | null;
  email: string | null;
  contractorProfileId: string | null;
  businessName: string | null;
  profileHref: string | null;
};

export type SupportConversation = {
  id: string;
  reference: string | null;
  status: string;
  priority: string;
  humanJoined: boolean;
  availability: SupportAvailability;
  messages: SupportMessage[];
  account: SupportAccount | null;
};

export type SupportSearchHit = {
  id: string;
  reference: string | null;
  status: string;
  visibility: string;
  excerpt: string;
  createdAt: string;
};

export type SupportArticle = {
  id: string;
  slug: string;
  title: string;
  body: string;
  status: string;
  updatedAt: string;
};

export type CannedResponse = {
  id: string;
  title: string;
  body: string;
  updatedAt: string;
};

export type SupportAnalytics = {
  days: number;
  timezone: string;
  opened: number;
  withFirstResponse: number;
  medianFirstResponseSeconds: number | null;
  byStatus: Record<string, number>;
  byDay: Array<{ day: string; opened: number }>;
  availability: SupportAvailability;
};

const QUEUES = new Set<SupportQueue>(["open", "assigned", "waiting", "resolved", "closed", "all", "mine"]);

function client() {
  const supabase = getSupabaseClient();
  if (!supabase) throw new Error("Supabase is not configured yet.");
  return supabase;
}

function fail(error: { message?: string; code?: string } | null, fallback: string): never {
  const raw = error?.message ?? "";
  if (/html is not allowed/i.test(raw)) {
    throw new Error("Use plain text or Markdown. HTML is not allowed.");
  }
  throw new Error(friendlyAdminError(error, fallback));
}

export function containsSupportHtml(value: string): boolean {
  return /<[A-Za-z/!]/.test(value);
}

function asRecord(value: unknown): Record<string, unknown> {
  if (value && typeof value === "object" && !Array.isArray(value)) return value as Record<string, unknown>;
  return {};
}

function asAvailability(value: unknown): SupportAvailability {
  return value === "available" || value === "away" ? value : "offline";
}

function asText(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value : null;
}

export function parseSupportQueue(data: unknown): SupportQueuePage {
  const row = asRecord(data);
  const queue = typeof row.queue === "string" && QUEUES.has(row.queue as SupportQueue) ? (row.queue as SupportQueue) : "open";
  const rows = Array.isArray(row.rows) ? row.rows : [];
  return {
    queue,
    availability: asAvailability(row.availability),
    rows: rows.flatMap((item) => {
      const record = asRecord(item);
      if (typeof record.id !== "string") return [];
      return [
        {
          id: record.id,
          reference: asText(record.reference),
          status: typeof record.status === "string" ? record.status : "OPEN",
          priority: typeof record.priority === "string" ? record.priority : "NORMAL",
          assignedAdminId: asText(record.assigned_admin_id),
          createdAt: typeof record.created_at === "string" ? record.created_at : "",
          lastMessageAt: asText(record.last_message_at),
          role: asText(record.role),
          displayName: asText(record.display_name),
          guest: record.guest === true,
        },
      ];
    }),
  };
}

export function parseSupportConversation(data: unknown): SupportConversation {
  const row = asRecord(data);
  const account = asRecord(row.account);
  const messages = Array.isArray(row.messages) ? row.messages : [];
  return {
    id: typeof row.id === "string" ? row.id : "",
    reference: asText(row.reference),
    status: typeof row.status === "string" ? row.status : "OPEN",
    priority: typeof row.priority === "string" ? row.priority : "NORMAL",
    humanJoined: row.human_joined === true,
    availability: asAvailability(row.availability),
    messages: messages.flatMap((item) => {
      const record = asRecord(item);
      if (typeof record.body !== "string" || !record.body.trim()) return [];
      return [
        {
          id: typeof record.id === "string" ? record.id : `m-${record.body.slice(0, 8)}`,
          role: typeof record.role === "string" ? record.role : "system",
          visibility: record.visibility === "internal" ? "internal" : "public",
          body: record.body,
          createdAt: typeof record.created_at === "string" ? record.created_at : "",
        },
      ];
    }),
    account: row.account
      ? {
          profileId: asText(account.profile_id),
          role: asText(account.role),
          accountStatus: asText(account.account_status),
          firstName: asText(account.first_name),
          lastName: asText(account.last_name),
          email: asText(account.email),
          contractorProfileId: asText(account.contractor_profile_id),
          businessName: asText(account.business_name),
          profileHref: asText(account.profile_href),
        }
      : null,
  };
}

export function parseSupportArticles(data: unknown): SupportArticle[] {
  if (!Array.isArray(data)) return [];
  return data.flatMap((item) => {
    const row = asRecord(item);
    if (typeof row.id !== "string" || typeof row.title !== "string") return [];
    return [
      {
        id: row.id,
        slug: typeof row.slug === "string" ? row.slug : "",
        title: row.title,
        body: typeof row.body_md === "string" ? row.body_md : "",
        status: typeof row.status === "string" ? row.status : "DRAFT",
        updatedAt: typeof row.updated_at === "string" ? row.updated_at : "",
      },
    ];
  });
}

export function parseCannedResponses(data: unknown): CannedResponse[] {
  if (!Array.isArray(data)) return [];
  return data.flatMap((item) => {
    const row = asRecord(item);
    if (typeof row.id !== "string" || typeof row.title !== "string") return [];
    return [
      {
        id: row.id,
        title: row.title,
        body: typeof row.body_md === "string" ? row.body_md : "",
        updatedAt: typeof row.updated_at === "string" ? row.updated_at : "",
      },
    ];
  });
}

export function parseSupportAnalytics(data: unknown): SupportAnalytics {
  const row = asRecord(data);
  const byStatus = asRecord(row.by_status);
  const days = Array.isArray(row.by_day) ? row.by_day : [];
  return {
    days: typeof row.days === "number" ? row.days : 30,
    timezone: typeof row.timezone === "string" ? row.timezone : "America/Chicago",
    opened: typeof row.opened === "number" ? row.opened : 0,
    withFirstResponse: typeof row.with_first_response === "number" ? row.with_first_response : 0,
    medianFirstResponseSeconds: typeof row.median_first_response_seconds === "number" ? row.median_first_response_seconds : null,
    byStatus: Object.fromEntries(
      Object.entries(byStatus).flatMap(([key, value]) => (typeof value === "number" ? [[key, value]] : [])),
    ),
    byDay: days.flatMap((item) => {
      const day = asRecord(item);
      if (typeof day.day !== "string") return [];
      return [{ day: day.day, opened: typeof day.opened === "number" ? day.opened : 0 }];
    }),
    availability: asAvailability(row.availability),
  };
}

export async function listSupportQueue(queue: SupportQueue): Promise<SupportQueuePage> {
  const { data, error } = await client().rpc("admin_support_list", { p_queue: queue, p_limit: 50 });
  if (error) fail(error, "Could not load the support queue.");
  return parseSupportQueue(data);
}

export async function getSupportConversation(id: string): Promise<SupportConversation> {
  const { data, error } = await client().rpc("admin_support_get", { p_id: id });
  if (error || !data) fail(error, "Could not open that conversation.");
  return parseSupportConversation(data);
}

export async function searchSupport(query: string): Promise<SupportSearchHit[]> {
  const { data, error } = await client().rpc("admin_support_search", { p_query: query });
  if (error) fail(error, "Could not search support history.");
  if (!Array.isArray(data)) return [];
  return data.flatMap((item) => {
    const row = asRecord(item);
    if (typeof row.id !== "string") return [];
    return [
      {
        id: row.id,
        reference: asText(row.reference),
        status: typeof row.status === "string" ? row.status : "",
        visibility: typeof row.visibility === "string" ? row.visibility : "public",
        excerpt: typeof row.excerpt === "string" ? row.excerpt : "",
        createdAt: typeof row.created_at === "string" ? row.created_at : "",
      },
    ];
  });
}

async function conversationRpc(
  name: "admin_support_set_status" | "admin_support_set_priority" | "admin_support_takeover" | "admin_support_reply" | "admin_support_note",
  args: Record<string, string>,
  fallback: string,
): Promise<SupportConversation> {
  const { data, error } = await client().rpc(name, args as never);
  if (error || !data) fail(error, fallback);
  return parseSupportConversation(data);
}

export async function setSupportStatus(id: string, status: string): Promise<SupportConversation> {
  return conversationRpc("admin_support_set_status", { p_id: id, p_status: status }, "Could not change the status.");
}

export async function setSupportPriority(id: string, priority: string): Promise<SupportConversation> {
  return conversationRpc("admin_support_set_priority", { p_id: id, p_priority: priority }, "Could not change the priority.");
}

export async function takeoverSupport(id: string): Promise<SupportConversation> {
  return conversationRpc("admin_support_takeover", { p_id: id }, "Could not take this conversation.");
}

export async function replySupport(id: string, body: string): Promise<SupportConversation> {
  if (containsSupportHtml(body)) throw new Error("Use plain text or Markdown. HTML is not allowed.");
  return conversationRpc("admin_support_reply", { p_id: id, p_body: body }, "Could not send that reply.");
}

export async function noteSupport(id: string, body: string): Promise<SupportConversation> {
  if (containsSupportHtml(body)) throw new Error("Use plain text or Markdown. HTML is not allowed.");
  return conversationRpc("admin_support_note", { p_id: id, p_body: body }, "Could not save that note.");
}

export async function setSupportPresence(status: SupportAvailability): Promise<SupportAvailability> {
  const { data, error } = await client().rpc("admin_support_set_presence", { p_status: status });
  if (error) fail(error, "Could not update your support status.");
  return asAvailability(data);
}

export async function heartbeatSupport(): Promise<void> {
  const { error } = await client().rpc("admin_support_heartbeat");
  if (error) fail(error, "Could not refresh support presence.");
}

export async function supportAnalytics(days = 30): Promise<SupportAnalytics> {
  const { data, error } = await client().rpc("admin_support_analytics", { p_days: days });
  if (error) fail(error, "Could not load support analytics.");
  return parseSupportAnalytics(data);
}

export async function listSupportArticles(): Promise<SupportArticle[]> {
  const { data, error } = await client().rpc("admin_support_kb_list");
  if (error) fail(error, "Could not load knowledge base articles.");
  return parseSupportArticles(data);
}

export async function saveSupportArticle(input: {
  id: string | null;
  title: string;
  body: string;
  status: string;
  slug: string;
}): Promise<SupportArticle[]> {
  if (containsSupportHtml(input.title) || containsSupportHtml(input.body)) {
    throw new Error("Use plain text or Markdown. HTML is not allowed.");
  }
  const { data, error } = await client().rpc("admin_support_kb_save", {
    p_id: input.id,
    p_title: input.title,
    p_body: input.body,
    p_status: input.status,
    p_slug: input.slug,
  });
  if (error) fail(error, "Could not save that article.");
  return parseSupportArticles(data);
}

export async function listCannedResponses(): Promise<CannedResponse[]> {
  const { data, error } = await client().rpc("admin_support_canned_list");
  if (error) fail(error, "Could not load canned responses.");
  return parseCannedResponses(data);
}

export async function saveCannedResponse(input: { id: string | null; title: string; body: string }): Promise<CannedResponse[]> {
  if (containsSupportHtml(input.title) || containsSupportHtml(input.body)) {
    throw new Error("Use plain text or Markdown. HTML is not allowed.");
  }
  const { data, error } = await client().rpc("admin_support_canned_save", {
    p_id: input.id,
    p_title: input.title,
    p_body: input.body,
  });
  if (error) fail(error, "Could not save that canned response.");
  return parseCannedResponses(data);
}

export async function deleteCannedResponse(id: string): Promise<void> {
  const { error } = await client().rpc("admin_support_canned_delete", { p_id: id });
  if (error) fail(error, "Could not delete that canned response.");
}

export async function setSupportRetention(days: number): Promise<number> {
  const { data, error } = await client().rpc("admin_support_set_retention", { p_days: days });
  if (error) fail(error, "Could not save the retention setting.");
  return typeof data === "number" ? data : days;
}

export async function purgeExpiredSupport(): Promise<number> {
  const { data, error } = await client().rpc("admin_support_purge_expired");
  if (error) fail(error, "Could not purge expired support conversations.");
  return typeof data === "number" ? data : 0;
}

export function subscribeSupportDesk(onChange: () => void): () => void {
  const supabase = getSupabaseClient();
  if (!supabase) return () => undefined;
  const channel = supabase
    .channel("support:desk", { config: { private: true } })
    .on("postgres_changes", { event: "*", schema: "public", table: "support_messages" }, () => onChange())
    .on("postgres_changes", { event: "*", schema: "public", table: "support_conversations" }, () => onChange())
    .subscribe();
  return () => {
    void supabase.removeChannel(channel);
  };
}
