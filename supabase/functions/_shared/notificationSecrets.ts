import { resolveSecret, resolveUnsubscribeSecret } from "./notificationPolicy.ts";
import { resolveSmtpConfig, type SmtpConfigResult } from "./smtp.ts";

export type NotificationRuntimeSecrets = {
  notifyWebhookSecret: string;
  vapidPublicKey: string;
  vapidPrivateKey: string;
  vapidSubject: string;
  notificationFrom: string;
  notificationSiteUrl: string;
  unsubscribeTokenSecret: string;
  smtp: SmtpConfigResult;
};

const DEFAULT_SUBJECT = "mailto:support@prioritypropertypros.com";
const DEFAULT_SENDER_NAME = "Priority Property Pros";

/**
 * NOTIFICATION_FROM wins when set (Vault or env). Otherwise send as the
 * authenticated SMTP mailbox, because Gmail rewrites a From address that is
 * not the signed-in user or one of its verified "Send mail as" aliases.
 */
export function defaultNotificationFrom(smtpUser: string): string {
  const user = smtpUser.trim();
  return `${DEFAULT_SENDER_NAME} <${user || "support@prioritypropertypros.com"}>`;
}
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
    }) || defaultNotificationFrom(Deno.env.get("SMTP_USER") ?? ""),
    notificationSiteUrl: (site || DEFAULT_SITE).replace(/\/$/, ""),
    unsubscribeTokenSecret: resolveUnsubscribeSecret({
      vaultUnsubscribe: vault.unsubscribe_token_secret,
      envUnsubscribe: Deno.env.get("UNSUBSCRIBE_TOKEN_SECRET"),
      vaultWebhook: vault.notify_webhook_secret,
      envWebhook: Deno.env.get("NOTIFY_WEBHOOK_SECRET"),
    }),
    // SMTP credentials are Edge Function secrets only (Dashboard → Edge
    // Functions → Secrets). They are never read from Vault or the database.
    smtp: resolveSmtpConfig({
      host: Deno.env.get("SMTP_HOST"),
      port: Deno.env.get("SMTP_PORT"),
      username: Deno.env.get("SMTP_USER"),
      password: Deno.env.get("SMTP_PASS"),
    }),
  };
}
