import { resolveSecret, resolveUnsubscribeSecret } from "./notificationPolicy.ts";

export type NotificationRuntimeSecrets = {
  notifyWebhookSecret: string;
  vapidPublicKey: string;
  vapidPrivateKey: string;
  vapidSubject: string;
  notificationFrom: string;
  notificationSiteUrl: string;
  unsubscribeTokenSecret: string;
  resendApiKey: string;
};

const DEFAULT_SUBJECT = "mailto:prioritypropertypros@gmail.com";
const DEFAULT_FROM = "Priority Property Pros <notifications@prioritypropertypros.com>";
const DEFAULT_SITE = "https://prioritypropertypros.com";

function asSecretMap(value: unknown): Record<string, string> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  const out: Record<string, string> = {};
  for (const [key, raw] of Object.entries(value)) {
    if (typeof raw === "string") out[key] = raw;
  }
  return out;
}

async function readVault(service: { url: string; key: string } | null): Promise<Record<string, string>> {
  if (!service) return {};
  try {
    const res = await fetch(`${service.url}/rest/v1/rpc/get_notification_channel_secrets`, {
      method: "POST",
      headers: {
        apikey: service.key,
        Authorization: `Bearer ${service.key}`,
        "Content-Type": "application/json",
      },
      body: "{}",
    });
    if (!res.ok) {
      console.warn(`vault secrets skipped: status ${res.status}`);
      return {};
    }
    return asSecretMap(await res.json());
  } catch {
    console.warn("vault secrets skipped");
    return {};
  }
}

export async function loadNotificationRuntimeSecrets(
  service: { url: string; key: string } | null,
): Promise<NotificationRuntimeSecrets> {
  const vault = await readVault(service);
  const notifyWebhookSecret = resolveSecret({
    vaultValue: vault.notify_webhook_secret,
    envValue: Deno.env.get("NOTIFY_WEBHOOK_SECRET"),
  });
  const site = resolveSecret({
    vaultValue: vault.notification_site_url,
    envValue: Deno.env.get("NOTIFICATION_SITE_URL"),
  });
  return {
    notifyWebhookSecret,
    vapidPublicKey: resolveSecret({
      vaultValue: vault.vapid_public_key,
      envValue: Deno.env.get("VAPID_PUBLIC_KEY"),
    }),
    vapidPrivateKey: resolveSecret({
      vaultValue: vault.vapid_private_key,
      envValue: Deno.env.get("VAPID_PRIVATE_KEY"),
    }),
    vapidSubject: resolveSecret({
      vaultValue: vault.vapid_subject,
      envValue: Deno.env.get("VAPID_SUBJECT"),
    }) || DEFAULT_SUBJECT,
    notificationFrom: resolveSecret({
      vaultValue: vault.notification_from,
      envValue: Deno.env.get("NOTIFICATION_FROM"),
    }) || DEFAULT_FROM,
    notificationSiteUrl: (site || DEFAULT_SITE).replace(/\/$/, ""),
    unsubscribeTokenSecret: resolveUnsubscribeSecret({
      vaultUnsubscribe: vault.unsubscribe_token_secret,
      envUnsubscribe: Deno.env.get("UNSUBSCRIBE_TOKEN_SECRET"),
      vaultWebhook: vault.notify_webhook_secret,
      envWebhook: Deno.env.get("NOTIFY_WEBHOOK_SECRET"),
    }),
    resendApiKey: resolveSecret({
      vaultValue: vault.resend_api_key,
      envValue: Deno.env.get("RESEND_API_KEY"),
      preferEnv: true,
    }),
  };
}
