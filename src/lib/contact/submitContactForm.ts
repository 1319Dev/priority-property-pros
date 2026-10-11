import { getSupabaseAnonKey, getSupabaseUrl, isSupabaseConfigured } from "../supabase/config";
import type { ContactTopicId } from "./contactForm";

export type ContactSubmitInput = {
  name: string;
  email: string;
  phone: string;
  topic: string;
  message: string;
  companyWebsite: string;
};

export type ContactSubmitCode = "validation" | "rate_limited" | "unavailable" | "offline";

export type ContactSubmitResult = { ok: true } | { ok: false; code: ContactSubmitCode };

function readCode(payload: unknown): string | null {
  if (!payload || typeof payload !== "object") return null;
  const code = (payload as { code?: unknown }).code;
  return typeof code === "string" ? code : null;
}

export async function submitContactForm(input: ContactSubmitInput): Promise<ContactSubmitResult> {
  if (!isSupabaseConfigured()) return { ok: false, code: "offline" };
  const url = getSupabaseUrl().replace(/\/$/, "");
  const key = getSupabaseAnonKey();
  let response: Response;
  try {
    response = await fetch(`${url}/functions/v1/contact-form`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        apikey: key,
        Authorization: `Bearer ${key}`,
      },
      body: JSON.stringify({
        name: input.name,
        email: input.email,
        phone: input.phone,
        topic: input.topic,
        message: input.message,
        company_website: input.companyWebsite,
      }),
    });
  } catch {
    return { ok: false, code: "unavailable" };
  }

  let payload: unknown = null;
  try {
    payload = await response.json();
  } catch {
    payload = null;
  }
  if (response.ok && payload && typeof payload === "object" && (payload as { ok?: unknown }).ok === true) {
    return { ok: true };
  }
  const code = readCode(payload);
  if (code === "validation") return { ok: false, code: "validation" };
  if (code === "rate_limited") return { ok: false, code: "rate_limited" };
  return { ok: false, code: "unavailable" };
}

export function isContactTopic(value: string): value is ContactTopicId {
  return value === "marketplace" || value === "account" || value === "billing" || value === "report" || value === "other";
}
