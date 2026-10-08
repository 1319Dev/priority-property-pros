import {
  NOTIFICATION_CATEGORY_COPY,
  absoluteUrl,
  defaultPreference,
  verifyUnsubscribeToken,
  type NotificationCategory,
} from "../_shared/notificationPolicy.ts";

function page(title: string, message: string, status = 200): Response {
  const site = (Deno.env.get("NOTIFICATION_SITE_URL") ?? "https://prioritypropertypros.com").replace(/\/$/, "");
  const manage = absoluteUrl(site, "/notifications");
  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${title}</title>
</head>
<body style="margin:0;background:#fbf8f1;color:#1a1814;font-family:Arial, Helvetica, sans-serif;">
  <main style="max-width:32rem;margin:0 auto;padding:48px 20px;">
    <p style="margin:0;letter-spacing:0.16em;text-transform:uppercase;font-size:12px;color:#a6851f;">Priority Property Pros</p>
    <h1 style="font-family:Georgia, serif;font-size:36px;color:#1a3c2e;">${title}</h1>
    <p style="font-size:16px;line-height:1.5;color:#3f3a33;">${message}</p>
    <p><a href="${manage}" style="color:#1a3c2e;">Manage notification settings</a></p>
  </main>
</body>
</html>`;
  return new Response(html, {
    status,
    headers: { "Content-Type": "text/html; charset=utf-8" },
  });
}

function service(): { url: string; key: string } | null {
  const url = (Deno.env.get("SUPABASE_URL") ?? "").replace(/\/$/, "");
  const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
  if (!url || !key) return null;
  return { url, key };
}

async function rest<T>(path: string, init: RequestInit = {}): Promise<{ status: number; data: T | null }> {
  const svc = service();
  if (!svc) return { status: 0, data: null };
  const headers = new Headers(init.headers);
  headers.set("apikey", svc.key);
  headers.set("Authorization", `Bearer ${svc.key}`);
  if (!headers.has("Content-Type")) headers.set("Content-Type", "application/json");
  const res = await fetch(`${svc.url}/rest/v1/${path}`, { ...init, headers });
  const text = await res.text();
  if (!text) return { status: res.status, data: null };
  try {
    return { status: res.status, data: JSON.parse(text) as T };
  } catch {
    return { status: res.status, data: null };
  }
}

async function turnEmailOff(userId: string, category: NotificationCategory): Promise<boolean> {
  const patched = await rest<Array<{ email: boolean }>>(
    `notification_preferences?user_id=eq.${userId}&category=eq.${category}`,
    {
      method: "PATCH",
      headers: { Prefer: "return=representation" },
      body: JSON.stringify({ email: false }),
    },
  );
  if ((patched.data ?? []).length > 0) return true;
  const defaults = defaultPreference(category);
  const inserted = await rest(`notification_preferences`, {
    method: "POST",
    headers: { Prefer: "return=minimal" },
    body: JSON.stringify({
      user_id: userId,
      category,
      in_app: defaults.in_app,
      push: false,
      email: false,
    }),
  });
  return inserted.status >= 200 && inserted.status < 300;
}

Deno.serve(async (req) => {
  if (req.method !== "GET" && req.method !== "POST") {
    return page("Unsubscribe", "Open the unsubscribe link from your email.", 405);
  }
  const url = new URL(req.url);
  let token = url.searchParams.get("token") ?? "";
  if (!token && req.method === "POST") {
    const contentType = req.headers.get("content-type") ?? "";
    if (contentType.includes("application/json")) {
      try {
        const body = (await req.json()) as { token?: unknown };
        if (typeof body.token === "string") token = body.token;
      } catch {
        token = "";
      }
    }
  }
  const secret = Deno.env.get("NOTIFY_WEBHOOK_SECRET") ?? "";
  const verified = await verifyUnsubscribeToken(token, secret);
  if (!verified.ok) {
    const message = verified.reason === "expired"
      ? "This unsubscribe link has expired. You can turn email off from notification settings."
      : "This unsubscribe link is not valid.";
    return page("Unsubscribe", message, 400);
  }
  const label = NOTIFICATION_CATEGORY_COPY[verified.category].label;
  const saved = await turnEmailOff(verified.userId, verified.category);
  if (!saved) {
    return page("Unsubscribe", "Email could not be turned off just now. Use notification settings instead.", 500);
  }
  return page("Email off", `Email alerts for ${label} are off. In-site and push alerts are unchanged.`);
});
