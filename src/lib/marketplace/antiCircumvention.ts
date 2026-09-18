/** Obvious pre-connection contact detection. Not surveillance — phones, emails, URLs, social, exact street, QR. */

export const PRE_HIRE_CONTACT_MESSAGE =
  "Please keep communication on Priority Property Pros until you connect. Do not share phone numbers, emails, websites, social handles, QR codes, or an exact street address here.";

export const PRE_HIRE_CONTACT_HINT =
  "Don’t include a phone, email, website, social handle, QR code, or exact street. Contact is shared after a paid connection through Priority Property Pros.";

export type PreHireContactKind = "phone" | "email" | "url" | "social" | "street" | "qr";

const EMAIL_RE = /[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/i;
const URL_RE = /(?:https?:\/\/|www\.)\S+|\b[\w.-]+\.(?:com|net|org|io|co|us|biz|info|app)(?:\/|\b)/i;
const SOCIAL_SITE_RE =
  /\b(?:instagram|facebook|tiktok|twitter|linkedin|youtube|whatsapp|telegram|snapchat|nextdoor)\.com\b|\b(?:fb|x)\.com\b/i;
const SOCIAL_HANDLE_RE = /(^|[^a-z0-9])@[a-z0-9._]{2,}\b/i;
const PHONE_RE = /(?:\+?1[\s.-]?)?(?:\(?\d{3}\)?[\s.-]?)\d{3}[\s.-]?\d{4}\b/;
const DIGITS_PHONE_RE = /(?<!\d)\d{10}(?!\d)/;
const QR_RE = /\bqr\s*codes?\b/i;
const STREET_RE =
  /\b\d{1,5}\s+[A-Za-z][A-Za-z .'-]{0,40}\s(?:street|st\.?|avenue|ave\.?|road|rd\.?|drive|dr\.?|lane|ln\.?|boulevard|blvd\.?|way|court|ct\.?|circle|cir\.?|place|pl\.?)\b/i;

export function findPreHireContact(text: string | null | undefined): PreHireContactKind | null {
  const value = text ?? "";
  if (!value.trim()) return null;
  if (EMAIL_RE.test(value)) return "email";
  if (URL_RE.test(value) || SOCIAL_SITE_RE.test(value)) return "url";
  if (SOCIAL_HANDLE_RE.test(value)) return "social";
  if (PHONE_RE.test(value) || DIGITS_PHONE_RE.test(value)) return "phone";
  if (QR_RE.test(value)) return "qr";
  if (STREET_RE.test(value)) return "street";
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

/**
 * After a legitimate unlock between those parties, do not block ordinary contact.
 * Missing entitlement keeps the pre-connection scanner on.
 */
export function shouldScanForCircumvention(entitled: boolean): boolean {
  return !entitled;
}

export function preConnectionContactBlocked(
  text: string | null | undefined,
  entitled: boolean,
): boolean {
  if (!shouldScanForCircumvention(entitled)) return false;
  return containsPreHireContact(text);
}
