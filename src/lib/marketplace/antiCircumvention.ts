/** Obvious pre-hire contact detection. Not surveillance — phones, emails, URLs, and social handles only. */

export const PRE_HIRE_CONTACT_MESSAGE =
  "For your privacy and protection, contact information is shared after you’re connected through Priority Property Pros.";

export const PRE_HIRE_CONTACT_HINT =
  "Don’t include a phone, email, website, or social handle. Contact is shared after you’re connected through Priority Property Pros.";

export type PreHireContactKind = "phone" | "email" | "url" | "social";

const EMAIL_RE = /[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/i;
const URL_RE = /(?:https?:\/\/|www\.)\S+|\b[\w.-]+\.(?:com|net|org|io|co|us|biz|info|app)(?:\/|\b)/i;
const SOCIAL_SITE_RE =
  /\b(?:instagram|facebook|tiktok|twitter|linkedin|youtube|whatsapp|telegram|snapchat|nextdoor)\.com\b|\b(?:fb|x)\.com\b/i;
const SOCIAL_HANDLE_RE = /(^|[^a-z0-9])@[a-z0-9._]{2,}\b/i;
const PHONE_RE = /(?:\+?1[\s.-]?)?(?:\(?\d{3}\)?[\s.-]?)\d{3}[\s.-]?\d{4}\b/;
const DIGITS_PHONE_RE = /(?<!\d)\d{10}(?!\d)/;

export function findPreHireContact(text: string | null | undefined): PreHireContactKind | null {
  const value = text ?? "";
  if (!value.trim()) return null;
  if (EMAIL_RE.test(value)) return "email";
  if (URL_RE.test(value) || SOCIAL_SITE_RE.test(value)) return "url";
  if (SOCIAL_HANDLE_RE.test(value)) return "social";
  if (PHONE_RE.test(value) || DIGITS_PHONE_RE.test(value)) return "phone";
  return null;
}

export function containsPreHireContact(text: string | null | undefined): boolean {
  return findPreHireContact(text) != null;
}

export function preHireContactError(text: string | null | undefined): string | null {
  return containsPreHireContact(text) ? PRE_HIRE_CONTACT_MESSAGE : null;
}

export function assertNoPreHireContact(text: string | null | undefined): void {
  const message = preHireContactError(text);
  if (message) throw new Error(message);
}

export function assertNoPreHireContactIn(...texts: Array<string | null | undefined>): void {
  for (const text of texts) assertNoPreHireContact(text);
}
