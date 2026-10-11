import { handleContactForm, safeContactFrom, safeContactMailbox } from "../_shared/contactForm.ts";
import { loadNotificationRuntimeSecrets } from "../_shared/notificationSecrets.ts";

function service(): { url: string; key: string } | null {
  const url = (Deno.env.get("SUPABASE_URL") ?? "").replace(/\/$/, "");
  const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
  if (!url || !key) return null;
  return { url, key };
}

Deno.serve(async (req) => {
  const svc = service();
  let resendApiKey = "";
  let fromEmail = "";
  try {
    const secrets = await loadNotificationRuntimeSecrets(svc);
    resendApiKey = secrets.resendApiKey;
    fromEmail = secrets.notificationFrom;
  } catch {
    console.warn("contact form secrets unavailable");
  }
  const salt =
    (Deno.env.get("CONTACT_IP_HASH_SALT") ?? "").trim() ||
    (Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "").trim() ||
    "contact-form";
  return handleContactForm(req, {
    resendApiKey,
    toEmail: safeContactMailbox(Deno.env.get("CONTACT_TO_EMAIL") ?? ""),
    fromEmail: safeContactFrom(fromEmail),
    ipHashSalt: salt,
    service: svc,
  });
});
