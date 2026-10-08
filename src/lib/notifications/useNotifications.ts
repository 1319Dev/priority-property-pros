import { useCallback, useEffect, useMemo, useState } from "react";
import { useAuth } from "../auth/useAuth";
import { getSupabaseClient } from "../supabase/client";
import {
  listInAppNotifications,
  listNotificationPreferences,
  markAllNotificationsRead,
  markNotificationRead,
  type InAppNotification,
  type PreferenceRecord,
} from "./api";

const FALLBACK_POLL_MS = 20_000;

export function useNotifications(options?: { enabled?: boolean }) {
  const { user, account_type } = useAuth();
  const enabled = (options?.enabled ?? true) && Boolean(user);
  const [items, setItems] = useState<InAppNotification[]>([]);
  const [preferences, setPreferences] = useState<PreferenceRecord[] | null>(null);

  const load = useCallback(async () => {
    if (!enabled) return;
    try {
      const [notes, prefs] = await Promise.all([
        listInAppNotifications(account_type),
        listNotificationPreferences(),
      ]);
      setItems(notes);
      setPreferences(prefs);
    } catch {
      setItems((current) => current);
    }
  }, [account_type, enabled]);

  useEffect(() => {
    if (!enabled || !user) return undefined;
    let stop = false;
    let realtime = false;
    const run = () => {
      if (stop || document.visibilityState === "hidden") return;
      void load();
    };
    run();

    const supabase = getSupabaseClient();
    const channel = supabase
      ?.channel(`notifications:${user.id}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "notifications",
          filter: `recipient_profile_id=eq.${user.id}`,
        },
        () => run(),
      )
      .subscribe((status) => {
        realtime = status === "SUBSCRIBED";
      });

    const poll = window.setInterval(() => {
      if (!realtime) run();
    }, FALLBACK_POLL_MS);
    document.addEventListener("visibilitychange", run);

    return () => {
      stop = true;
      window.clearInterval(poll);
      document.removeEventListener("visibilitychange", run);
      if (channel && supabase) void supabase.removeChannel(channel);
    };
  }, [enabled, load, user]);

  const visible = useMemo(
    () =>
      items.filter((item) => {
        const pref = preferences?.find((row) => row.category === item.category);
        return pref ? pref.in_app : true;
      }),
    [items, preferences],
  );
  const unread = visible.filter((item) => !item.readAt).length;

  async function markRead(id: string) {
    const stamp = new Date().toISOString();
    setItems((current) => current.map((item) => (item.id === id && !item.readAt ? { ...item, readAt: stamp } : item)));
    try {
      await markNotificationRead(id);
    } catch {
      void load();
    }
  }

  async function markAllRead() {
    const stamp = new Date().toISOString();
    setItems((current) => current.map((item) => (item.readAt ? item : { ...item, readAt: stamp })));
    try {
      await markAllNotificationsRead();
    } catch {
      void load();
    }
  }

  return { items: visible, unread, markRead, markAllRead, refresh: load };
}
