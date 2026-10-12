import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useAuth } from "../auth/useAuth";
import { fetchContractorProfileByUser, fetchMyBookings } from "../marketplace/api";
import { contractorHiredLandingPath, type HiredBookingRef } from "../marketplace/hiredJobs";
import {
  listInAppNotifications,
  markAllNotificationsRead,
  markNotificationRead,
  type InAppNotification,
} from "./api";
import { dedupeNotificationRows } from "./presentation";
import { notificationRealtimeActive, subscribeUserNotifications } from "./realtime";

function withHiredJobLinks(notes: InAppNotification[], bookings: readonly HiredBookingRef[]): InAppNotification[] {
  return notes.map((note) => ({
    ...note,
    path: contractorHiredLandingPath({
      kind: note.kind,
      path: note.path,
      payload: {
        project_id: note.projectId ?? undefined,
        booking_id: note.bookingId ?? undefined,
        contractor_profile_id: note.contractorProfileId ?? undefined,
      },
      bookings,
    }),
  }));
}

function applyReadOverrides(notes: InAppNotification[], overrides: ReadonlyMap<string, string>): InAppNotification[] {
  return notes.map((note) => {
    const stamp = overrides.get(note.id);
    if (!stamp) return note;
    if (note.readAt) return note;
    return { ...note, readAt: stamp };
  });
}

const FALLBACK_POLL_MS = 20_000;

export function useNotifications(options?: { enabled?: boolean }) {
  const { user, account_type } = useAuth();
  const enabled = (options?.enabled ?? true) && Boolean(user);
  const [items, setItems] = useState<InAppNotification[]>([]);
  const [ready, setReady] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const readOverrides = useRef(new Map<string, string>());

  const load = useCallback(async () => {
    if (!enabled) return;
    try {
      const notes = dedupeNotificationRows(await listInAppNotifications(account_type));
      let nextNotes = notes;
      if (account_type === "CONTRACTOR" && user) {
        try {
          const profile = await fetchContractorProfileByUser(user.id);
          if (profile) {
            const bookings = (await fetchMyBookings("contractor", profile.id)) as HiredBookingRef[];
            nextNotes = withHiredJobLinks(notes, bookings);
          }
        } catch {
          nextNotes = notes;
        }
      }
      for (const note of nextNotes) {
        if (note.readAt) readOverrides.current.delete(note.id);
      }
      setItems(applyReadOverrides(nextNotes, readOverrides.current));
      setLoadError(null);
    } catch {
      setLoadError("Couldn't load notifications.");
    } finally {
      setReady(true);
    }
  }, [account_type, enabled, user]);

  useEffect(() => {
    readOverrides.current.clear();
  }, [user?.id]);

  useEffect(() => {
    if (!enabled || !user) return undefined;
    let stop = false;
    let unsubscribe: () => void = () => undefined;
    const run = () => {
      if (stop || document.visibilityState === "hidden") return;
      void load();
    };
    run();
    try {
      unsubscribe = subscribeUserNotifications(user.id, run);
    } catch {
      unsubscribe = () => undefined;
    }

    const poll = window.setInterval(() => {
      if (!notificationRealtimeActive(user.id)) run();
    }, FALLBACK_POLL_MS);
    document.addEventListener("visibilitychange", run);

    return () => {
      stop = true;
      window.clearInterval(poll);
      document.removeEventListener("visibilitychange", run);
      unsubscribe();
    };
  }, [enabled, load, user]);

  const visible = useMemo(() => items, [items]);
  const unread = visible.filter((item) => !item.readAt).length;

  async function markRead(id: string) {
    const stamp = new Date().toISOString();
    readOverrides.current.set(id, stamp);
    setItems((current) => current.map((item) => (item.id === id && !item.readAt ? { ...item, readAt: stamp } : item)));
    try {
      await markNotificationRead(id);
    } catch {
      readOverrides.current.delete(id);
      void load();
    }
  }

  async function markAllRead() {
    const stamp = new Date().toISOString();
    const touched = items.filter((item) => !item.readAt).map((item) => item.id);
    for (const id of touched) readOverrides.current.set(id, stamp);
    setItems((current) => current.map((item) => (item.readAt ? item : { ...item, readAt: stamp })));
    try {
      await markAllNotificationsRead();
    } catch {
      for (const id of touched) readOverrides.current.delete(id);
      void load();
    }
  }

  return { items: visible, unread, ready, loadError, markRead, markAllRead, refresh: load };
}
