import { getSupabaseClient } from "../supabase/client";
import type { Json } from "../supabase/database.types";
import { coerceProjectReference } from "../marketplace/projectReference";
import { dedupeNotificationRows, safeProjectTitle } from "./presentation";
import {
  NOTIFICATION_CATEGORIES,
  categoriesForAccount,
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
  bookingId?: string | null;
  contractorProfileId?: string | null;
  projectTitle?: string | null;
  referenceNumber?: number | null;
  entityId?: string | null;
  actionState?: "open" | "historical";
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
    action_state?: string | null;
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
    bookingId: typeof payload.booking_id === "string" ? payload.booking_id : null,
    contractorProfileId: typeof payload.contractor_profile_id === "string" ? payload.contractor_profile_id : null,
    projectTitle: safeProjectTitle(typeof payload.project_title === "string" ? payload.project_title : null),
    referenceNumber: coerceProjectReference(payload.project_reference_number ?? payload.reference_number),
    entityId: row.entity_id,
    actionState: row.action_state === "historical" || row.action_state === "open" ? row.action_state : undefined,
    readAt: row.read_at,
    createdAt: row.created_at,
    category,
  };
}

export async function listInAppNotifications(accountType: NotificationAudience): Promise<InAppNotification[]> {
  const { data, error } = await client().rpc("list_my_notifications");
  if (error) throw new Error("Could not load notifications.");
  const rows = Array.isArray(data) ? data : [];
  const mapped = rows.map((row) => {
    const item = (row ?? {}) as Record<string, unknown>;
    const payload = item.payload;
    return toInAppNotification(
      {
        id: String(item.id ?? ""),
        kind: String(item.kind ?? ""),
        title: String(item.title ?? ""),
        body: String(item.body ?? ""),
        entity_id: typeof item.entity_id === "string" ? item.entity_id : null,
        payload: payload && typeof payload === "object" && !Array.isArray(payload) ? (payload as Json) : {},
        read_at: typeof item.read_at === "string" ? item.read_at : null,
        created_at: typeof item.created_at === "string" ? item.created_at : "",
        action_state: typeof item.action_state === "string" ? item.action_state : null,
      },
      accountType,
    );
  });
  return dedupeNotificationRows(mapped);
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
  const supabase = client();
  let accountType: string | null = null;
  const { data } = await supabase.auth.getUser();
  const userId = data.user?.id;
  if (userId) {
    const profile = await supabase.from("profiles").select("account_type").eq("id", userId).maybeSingle();
    if (typeof profile.data?.account_type === "string") accountType = profile.data.account_type;
  }
  const { error } = await supabase
    .from("notification_preferences")
    .update({ push: true })
    .in("category", [...categoriesForAccount(accountType)]);
  if (error) throw new Error("Could not turn on push alerts.");
}

export async function markNotificationRead(id: string): Promise<void> {
  const { error } = await client().rpc("mark_notification_read", { p_notification_id: id });
  if (error) throw new Error("Could not update that alert.");
}

export async function markAllNotificationsRead(): Promise<void> {
  const supabase = client();
  const { error } = await supabase.rpc("mark_all_my_notifications_read");
  if (!error) return;
  const fallback = await supabase.from("notifications").update({ read_at: new Date().toISOString() }).is("read_at", null);
  if (fallback.error) throw new Error("Could not update alerts.");
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
