/**
 * Obvious contact-exchange detection for estimate notes, bios, and messages.
 * Not surveillance: only flags phone / email / URL / social handle patterns
 * in text the user is submitting. Dedicated fields like website_url stay allowed.
 */

export const CONTACT_AFTER_CONNECTION_COPY =
  "Contact info is shared after connection through Priority Property Pros. Please remove phone numbers, emails, links, and social handles.";

const EMAIL_RE = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/;
const URL_RE = /(?:https?:\/\/|www\.)\S+/i;
const SOCIAL_DOMAIN_RE =
  /\b(?:instagram|facebook|tiktok|twitter|linkedin|snapchat|whatsapp|telegram|threads\.net|x\.com)\b/i;
const SOCIAL_HANDLE_RE = /(^|[^\w])@[A-Za-z][A-Za-z0-9._]{2,}\b/;
const FORMATTED_PHONE_RE =
  /(?:\+?1[\s.-]?)?(?:\(?\d{3}\)?[\s.-]\d{3}[\s.-]\d{4})/;
const TEL_URI_RE = /tel:\+?\d{7,}/i;

export type ContactLeakKind = "phone" | "email" | "url" | "handle";

export type ContactLeakResult = {
  blocked: boolean;
  kinds: ContactLeakKind[];
  message: string | null;
};

export function detectContactLeak(text: string | null | undefined): ContactLeakResult {
  const value = text ?? "";
  if (!value.trim()) return { blocked: false, kinds: [], message: null };

  const kinds: ContactLeakKind[] = [];
  if (EMAIL_RE.test(value)) kinds.push("email");
  if (URL_RE.test(value) || SOCIAL_DOMAIN_RE.test(value)) kinds.push("url");
  if (SOCIAL_HANDLE_RE.test(value)) kinds.push("handle");
  if (FORMATTED_PHONE_RE.test(value) || TEL_URI_RE.test(value)) kinds.push("phone");

  const unique = [...new Set(kinds)];
  if (unique.length === 0) return { blocked: false, kinds: [], message: null };
  return { blocked: true, kinds: unique, message: CONTACT_AFTER_CONNECTION_COPY };
}

export function assertNoContactLeak(text: string | null | undefined): void {
  const result = detectContactLeak(text);
  if (result.blocked) {
    throw new Error(result.message ?? CONTACT_AFTER_CONNECTION_COPY);
  }
}

/** Fields that are dedicated public URLs / phones must not be scanned as leaks. */
export const CONTACT_SCAN_FIELDS = [
  "notes",
  "bio",
  "headline",
  "prompt",
  "answer_text",
  "body",
  "title",
  "description",
  "label",
] as const;
export type ContactScanField = (typeof CONTACT_SCAN_FIELDS)[number];
