import { useEffect, useState } from "react";
import {
  NOTIFICATION_CATEGORIES,
  NOTIFICATION_CATEGORY_COPY,
  type NotificationCategory,
  type NotificationChannel,
  type PreferenceFlags,
} from "../../lib/notifications/policy";
import { defaultPreference } from "../../lib/notifications/policy";
import {
  listNotificationPreferences,
  updateNotificationPreference,
  type PreferenceRecord,
} from "../../lib/notifications/api";
import { readIosPushSnapshot, shouldShowIosHomeScreenGuide } from "../../lib/notifications/iosPush";
import { currentPushEndpoint, disableBrowserPush, enableBrowserPush, pushSupported } from "../../lib/notifications/pushClient";

const CHANNELS: { key: NotificationChannel; label: string }[] = [
  { key: "in_app", label: "In-site" },
  { key: "push", label: "Push" },
  { key: "email", label: "Email" },
];

function startingPreferences(): PreferenceRecord[] {
  return NOTIFICATION_CATEGORIES.map((category) => ({ category, ...defaultPreference(category) }));
}

export function IosHomeScreenGuide() {
  return (
    <section className="rounded-3xl border border-gold-500/40 bg-cream-100 px-5 py-4 text-sm leading-relaxed text-ink-700">
      <h2 className="font-display text-2xl font-semibold text-forest-800">Add to Home Screen to get alerts</h2>
      <p className="mt-2">
        iPhone can deliver push alerts after you add this site to your Home Screen (iOS 16.4 or later).
      </p>
      <ol className="mt-3 list-decimal space-y-1 pl-5">
        <li>Tap the Share button in Safari.</li>
        <li>Tap Add to Home Screen.</li>
        <li>Open Priority Property Pros from your Home Screen, then turn on alerts here.</li>
      </ol>
      <p className="mt-3 text-ink-500">In-site and email alerts keep working in the browser.</p>
    </section>
  );
}

function Switch({
  checked,
  label,
  onClick,
}: {
  checked: boolean;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      onClick={onClick}
      className={`inline-flex min-h-11 items-center gap-2 rounded-full px-3 text-sm font-semibold ${
        checked ? "bg-forest-800 text-cream-50" : "bg-cream-100 text-ink-700"
      }`}
    >
      <span className={`h-3 w-3 rounded-full ${checked ? "bg-gold-500" : "bg-ink-300"}`} aria-hidden="true" />
      {checked ? "On" : "Off"}
    </button>
  );
}

export function NotificationSettings({
  mode = "live",
  forceIosGuide = false,
}: {
  mode?: "live" | "preview";
  forceIosGuide?: boolean;
}) {
  const [rows, setRows] = useState<PreferenceRecord[]>(startingPreferences);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [endpoint, setEndpoint] = useState<string | null>(null);
  const iosGuide = forceIosGuide || shouldShowIosHomeScreenGuide(readIosPushSnapshot());

  useEffect(() => {
    if (mode !== "live") return undefined;
    let stop = false;
    void listNotificationPreferences()
      .then((next) => {
        if (!stop) setRows(next);
      })
      .catch((loadError: unknown) => {
        if (!stop) setError(loadError instanceof Error ? loadError.message : "Could not load notification settings.");
      });
    void currentPushEndpoint().then((value) => {
      if (!stop) setEndpoint(value);
    });
    return () => {
      stop = true;
    };
  }, [mode]);

  async function toggle(category: NotificationCategory, channel: NotificationChannel) {
    const current = rows.find((row) => row.category === category);
    if (!current) return;
    const next = !current[channel];
    setRows((existing) =>
      existing.map((row) => (row.category === category ? { ...row, [channel]: next } : row)),
    );
    setError(null);
    if (mode === "preview") return;
    try {
      const patch: Partial<PreferenceFlags> = { [channel]: next };
      await updateNotificationPreference(category, patch);
    } catch (saveError) {
      setRows((existing) =>
        existing.map((row) => (row.category === category ? { ...row, [channel]: !next } : row)),
      );
      setError(saveError instanceof Error ? saveError.message : "Could not save that alert.");
    }
  }

  async function enablePush() {
    setBusy(true);
    setError(null);
    setNotice(null);
    if (mode === "preview") {
      setEndpoint("preview");
      setRows((existing) => existing.map((row) => ({ ...row, push: true })));
      setNotice("Push is on. Turn off any alert you do not want.");
      setBusy(false);
      return;
    }
    const result = await enableBrowserPush();
    setBusy(false);
    if (!result.ok) {
      setError(result.message);
      return;
    }
    setEndpoint(result.endpoint);
    setRows((existing) => existing.map((row) => ({ ...row, push: true })));
    setNotice("Push is on. Turn off any alert you do not want.");
  }

  async function disablePush() {
    if (!endpoint || mode === "preview") {
      setEndpoint(null);
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await disableBrowserPush(endpoint);
      setEndpoint(null);
      setNotice("Push is off on this browser.");
    } catch (disableError) {
      setError(disableError instanceof Error ? disableError.message : "Could not turn off push.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="max-w-2xl space-y-6">
      <header>
        <p className="text-xs font-semibold uppercase tracking-[0.22em] text-gold-600">Settings</p>
        <h1 className="mt-2 font-display text-4xl font-semibold text-forest-800">Notification settings</h1>
        <p className="mt-3 text-sm leading-relaxed text-ink-500">
          Choose in-site, push, and email separately for each alert. In-site alerts show in the bell. Push stays off until you enable it.
        </p>
      </header>

      {iosGuide ? (
        <IosHomeScreenGuide />
      ) : (
        <section className="rounded-3xl border border-forest-800/10 bg-cream-50 px-5 py-4">
          <h2 className="text-sm font-semibold text-forest-800">Push notifications</h2>
          {endpoint ? (
            <div className="mt-3 flex flex-wrap items-center gap-3">
              <p className="text-sm text-ink-700">Push is on for this browser.</p>
              <button
                type="button"
                className="inline-flex min-h-11 items-center rounded-full border border-forest-800/20 px-4 text-sm font-semibold text-forest-800"
                disabled={busy}
                onClick={() => {
                  void disablePush();
                }}
              >
                Turn off push on this browser
              </button>
            </div>
          ) : (
            <button
              type="button"
              className="mt-3 inline-flex min-h-12 items-center justify-center rounded-full bg-gold-500 px-5 text-sm font-semibold text-forest-950 disabled:opacity-50"
              disabled={busy || (mode === "live" && !pushSupported())}
              onClick={() => {
                void enablePush();
              }}
            >
              {busy ? "Enabling…" : "Enable push notifications"}
            </button>
          )}
          {mode === "live" && !pushSupported() && !iosGuide ? (
            <p className="mt-3 text-sm text-ink-500">This browser does not support push alerts.</p>
          ) : null}
        </section>
      )}

      {notice ? <p className="text-sm text-forest-800">{notice}</p> : null}
      {error ? <p className="text-sm text-danger-600">{error}</p> : null}

      <ul className="space-y-3">
        {rows.map((row) => {
          const copy = NOTIFICATION_CATEGORY_COPY[row.category];
          return (
            <li key={row.category} className="rounded-3xl border border-forest-800/10 bg-cream-50 px-5 py-4">
              <h2 className="font-semibold text-forest-800">{copy.label}</h2>
              <p className="mt-1 text-sm leading-relaxed text-ink-500">{copy.description}</p>
              <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-3">
                {CHANNELS.map((channel) => (
                  <div key={channel.key} className="flex items-center justify-between gap-3 sm:flex-col sm:items-start">
                    <span className="text-xs font-semibold uppercase tracking-[0.14em] text-gold-600">{channel.label}</span>
                    <Switch
                      checked={row[channel.key]}
                      label={`${copy.label} ${channel.label}`}
                      onClick={() => {
                        void toggle(row.category, channel.key);
                      }}
                    />
                  </div>
                ))}
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
