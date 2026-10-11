import { getSupabaseClient } from "../supabase/client";

type Hub = {
  listeners: Set<() => void>;
  realtime: boolean;
  stopChannel: () => void;
};

const hubs = new Map<string, Hub>();

/**
 * One realtime listener per signed-in user.
 * The bell and the history page both call this. A second `.on("postgres_changes")`
 * on a channel that is already subscribed throws
 * `cannot add postgres_changes callbacks for realtime:notifications:… after subscribe()`
 * and was blanking the history page. Each hub opens its own channel name and
 * never attaches another postgres_changes callback after subscribe.
 */
export function subscribeUserNotifications(userId: string, listener: () => void): () => void {
  let hub = hubs.get(userId);
  if (!hub) {
    const listeners = new Set<() => void>();
    const created: Hub = {
      listeners,
      realtime: false,
      stopChannel: () => undefined,
    };
    hubs.set(userId, created);
    created.stopChannel = openNotificationChannel(
      userId,
      () => {
        for (const fn of listeners) fn();
      },
      (active) => {
        created.realtime = active;
      },
    );
    hub = created;
  }
  hub.listeners.add(listener);
  return () => {
    const current = hubs.get(userId);
    if (!current) return;
    current.listeners.delete(listener);
    if (current.listeners.size === 0) {
      hubs.delete(userId);
      current.stopChannel();
    }
  };
}

export function notificationRealtimeActive(userId: string): boolean {
  return hubs.get(userId)?.realtime ?? false;
}

export function resetNotificationRealtimeForTests(): void {
  for (const hub of hubs.values()) hub.stopChannel();
  hubs.clear();
}

function openNotificationChannel(
  userId: string,
  onChange: () => void,
  setRealtime: (active: boolean) => void,
): () => void {
  const supabase = getSupabaseClient();
  if (!supabase) return () => undefined;
  const name = `notifications:${userId}:${crypto.randomUUID()}`;
  try {
    const channel = supabase
      .channel(name)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "notifications",
          filter: `recipient_profile_id=eq.${userId}`,
        },
        () => onChange(),
      )
      .subscribe((status) => {
        setRealtime(status === "SUBSCRIBED");
      });
    return () => {
      setRealtime(false);
      void supabase.removeChannel(channel);
    };
  } catch {
    setRealtime(false);
    return () => undefined;
  }
}
