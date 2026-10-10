import { getSupabaseClient } from "../supabase/client";
import type { Json } from "../supabase/database.types";
import {
  NOTIFICATION_CATEGORIES,
  categoryForKind,
  defaultPreference,
  notificationPath,
  type NotificationAudience,
  type NotificationCategory,
  type PreferenceFlags,
} from "../../../supabase/functions/_shared/notificationPolicy";

export type InAppNotification = {
  id: string;
  kind: string;
  title: string;
  body: string;
  path: string;
  projectId?: string | null;
  readAt: string | null;
  createdAt: string;
  category: NotificationCategory;
};

export type PreferenceRecord = PreferenceFlags & { category: NotificationCategory };

function client() {
  const supabase = getSupabaseClient();
  if (!supabase) throw new Error("Supabase is not configured yet.");
  return supabase;
}

function asRecord(value: Json): Record<string, unknown> {
  if (value && typeof value === "object" && !Array.isArray(value)) return value as Record<string, unknown>;
  return {};
}

export function toInAppNotification(
  row: {
    id: string;
    kind: string;
    title: string;
    body: string;
    entity_id: string | null;
    payload: Json;
    read_at: string | null;
    created_at: string;
  },
  accountType: NotificationAudience,
): InAppNotification {
  const category = categoryForKind(row.kind);
  const payload = asRecord(row.payload);
  return {
    id: row.id,
    kind: row.kind,
    title: row.title,
    body: row.body,
    path: notificationPath({
      kind: row.kind,
      entityId: row.entity_id,
      payload,
      accountType,
    }),
    projectId: typeof payload.project_id === "string" ? payload.project_id : null,
    readAt: row.read_at,
    createdAt: row.created_at,
    category,
  };
}

export async function listInAppNotifications(accountType: NotificationAudience): Promise<InAppNotification[]> {
  const { data, error } = await client()
    .from("notifications")
    .select("id, kind, title, body, entity_id, payload, read_at, created_at")
    .order("created_at", { ascending: false })
    .limit(30);
  if (error) throw new Error("Could not load notifications.");
  return (data ?? []).map((row) => toInAppNotification(row, accountType));
}

export async function listNotificationPreferences(): Promise<PreferenceRecord[]> {
  const supabase = client();
  const { error: ensureError } = await supabase.rpc("ensure_my_notification_preferences");
  if (ensureError) throw new Error("Could not load notification settings.");
  const { data, error } = await supabase
    .from("notification_preferences")
    .select("category, in_app, push, email");
  if (error) throw new Error("Could not load notification settings.");
  const byCategory = new Map((data ?? []).map((row) => [row.category, row]));
  return NOTIFICATION_CATEGORIES.map((category) => {
    const row = byCategory.get(category);
    const defaults = defaultPreference(category);
    return {
      category,
      in_app: row?.in_app ?? defaults.in_app,
      push: row?.push ?? defaults.push,
      email: row?.email ?? defaults.email,
    };
  });
}

export async function updateNotificationPreference(
  category: NotificationCategory,
  patch: Partial<PreferenceFlags>,
): Promise<void> {
  const { error } = await client().from("notification_preferences").update(patch).eq("category", category);
  if (error) throw new Error("Could not save that alert.");
}

export async function enablePushOnAllCategories(): Promise<void> {
  const { error } = await client().from("notification_preferences").update({ push: true }).in("category", [...NOTIFICATION_CATEGORIES]);
  if (error) throw new Error("Could not turn on push alerts.");
}

export async function markNotificationRead(id: string): Promise<void> {
  const { error } = await client()
    .from("notifications")
    .update({ read_at: new Date().toISOString() })
    .eq("id", id)
    .is("read_at", null);
  if (error) throw new Error("Could not update that alert.");
}

export async function markAllNotificationsRead(): Promise<void> {
  const { error } = await client().from("notifications").update({ read_at: new Date().toISOString() }).is("read_at", null);
  if (error) throw new Error("Could not update alerts.");
}

export async function countMyPushSubscriptions(): Promise<number> {
  const { count, error } = await client().from("push_subscriptions").select("id", { count: "exact", head: true });
  if (error) return 0;
  return count ?? 0;
}

export async function savePushSubscription(input: {
  endpoint: string;
  p256dh: string;
  auth: string;
  userAgent: string;
}): Promise<void> {
  const { error } = await client().rpc("save_my_push_subscription", {
    p_endpoint: input.endpoint,
    p_p256dh: input.p256dh,
    p_auth: input.auth,
    p_user_agent: input.userAgent,
  });
  if (error) throw new Error("Could not save this browser for push alerts.");
}

export async function deletePushSubscription(endpoint: string): Promise<void> {
  const { error } = await client().rpc("delete_my_push_subscription", { p_endpoint: endpoint });
  if (error) throw new Error("Could not remove push alerts on this browser.");
}
