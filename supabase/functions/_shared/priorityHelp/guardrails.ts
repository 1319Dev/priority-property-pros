/**
 * Priority Help refuses account actions and strips answers that leak
 * contact details, invented account changes, or the legacy percentage fee.
 * These checks run in the Edge Function. The model has no tools.
 */

export const HUMAN_HANDOFF =
  "I can't do that in this chat. I can't see your account, and I can't change payments, approvals, or refunds. Choose Talk to Support and a person can look it up. A person is not in this chat until they join.";

export const UNKNOWN_ANSWER =
  "I don't have that in the Priority Help knowledge base. Choose Talk to Support if you want a person to look it up. A person is not in this chat until they join.";

export const AI_UNAVAILABLE =
  "I can't answer that automatically right now. Choose Talk to Support and leave a message.";

export const INJECTION_REFUSAL =
  "I can only answer questions about how Priority Property Pros works, from the published policy. Choose Talk to Support if you want a person.";

/**
 * Priority Property Pros' own public contact route. Owner rule: the support
 * email appears only on the Contact us page, so answers point there and never
 * give an email address. The mailing address is public in the legal pages.
 */
export const PPP_CONTACT_PAGE = "the Contact us page (prioritypropertypros.com/contact)";
export const PPP_MAILING_ADDRESS = "Priority Property Pros LLC, 5900 Balcones Drive STE 100, Austin, TX 78731";
const ALLOWED_CONTACT: RegExp[] = [
  /(Priority Property Pros LLC,?\s*)?5900 Balcones Drive,? STE 100,? Austin,? TX 78731( US)?/gi,
];
// Any mention of a Priority Property Pros mailbox is rewritten to the Contact us page.
const PPP_EMAIL = /(?:mailto:)?[A-Z0-9._%+-]+@prioritypropertypros\.com/gi;
const EMAIL_VERB_BEFORE_CONTACT = /\b(email|e-mail|write to|message|contact)\s+(?:us\s+at\s+|at\s+)?(?=the Contact us page)/gi;

export const COMPLAINT_HANDOFF =
  "Reports go to a person. Choose Talk to Support and describe what happened. Reviewing a report does not mean Priority Property Pros guarantees the work or decides a construction dispute. A person is not in this chat until they join.";

const ACCOUNT_ACTION: RegExp[] = [
  /\brefund my\b/i,
  /\b(please )?refund (this|my|the|a)\b/i,
  /\b(process|start|issue) (a |my )?refund\b/i,
  /\bI want (a |my )?refund\b/i,
  /\bchargebacks?\b/i,
  /\bapprove\b/i,
  /\breject (my|this|the)\b/i,
  /\b(change|update|reset) my (email|password|phone|account|card)\b/i,
  /\bmy (payment|receipt|card|password|invoice)\b/i,
  /\b(did|has) my (payment|activation|connect)\b/i,
  /\bstatus of my\b/i,
  /\blook\s*up\b/i,
  /\bPPP-\d+\b/i,
  /\bbusiness name\b/i,
  /\btheir (phone|email|number|address)\b/i,
  /\b(phone|email) (number|address)\b/i,
  /\bdelete my account\b/i,
  /\bcancel my account\b/i,
];

const COMPLAINT: RegExp[] = [
  /\b(file|submit|make) (a )?complaint\b/i,
  /\bI (want|need|would like) to (file|report|make)\b/i,
  /\breport (fraud|impersonation|harassment|a contractor|this contractor|a pro|this pro|a profile|a review)\b/i,
];

const AFFIRMATIVE_DUTY: RegExp[] = [
  /\b(we|I|Priority Property Pros|PPP)\s+(guarantee|guarantees|employ|employs|supervise|supervises|inspect|inspects|insure|insures|verify|verifies)\b/i,
  /\b(we|I|Priority Property Pros|PPP)\s+will\s+(guarantee|employ|supervise|inspect|insure|verify|resolve|decide|settle)\b/i,
  /\b(we|Priority Property Pros|PPP)\s+(resolve|resolves)\s+(construction\s+)?disputes\b/i,
  /\bcontractors are (our )?employees\b/i,
];

const LEAK: RegExp[] = [
  /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i,
  /(?:\+?1[\s.-]?)?\(?\d{3}\)?[\s.-]\d{3}[\s.-]\d{4}/,
  /\b7\s*%/,
  /contractor_fee/i,
  /\b\d{2,4}\s*bps\b/i,
  /\bI (approved|refunded|charged|cancelled)\b/i,
  /\b(a )?human is (here|responding|replying|on the way)\b/i,
  /\bI (have|'ve) joined\b/i,
  /\b\d{1,6}\s+(?:[A-Za-z0-9.'-]+\s+){0,4}(?:Street|St|Avenue|Ave|Road|Rd|Drive|Dr|Lane|Ln|Boulevard|Blvd|Court|Ct|Way|Circle|Cir|Parkway|Pkwy|Place|Pl|Trail|Trl|Highway|Hwy)\b/i,
  // Echoes of the system prompt.
  /You are Priority Help, the support assistant/i,
  /Live platform settings\. Quote these amounts/i,
  /Knowledge excerpts:/i,
  /\bsk-[A-Za-z0-9_-]{8,}/,
];

// Attempts to override the rules or pull out the prompt. Refused without a model call.
const INJECTION: RegExp[] = [
  /\b(ignore|disregard|forget|override|bypass)\b.{0,40}\b(instructions?|rules|prompt|guardrails?|system message)\b/i,
  /\b(system|developer|hidden|initial|original)\s+(prompt|message|instructions?)\b/i,
  /\b(reveal|show|print|repeat|output|tell me)\b.{0,30}\b(your|the)\s+(prompt|instructions|rules|system message|configuration)\b/i,
  /\byou are (now|no longer)\b/i,
  /\b(pretend|act as|roleplay as|role-play as)\b.{0,40}\b(admin|developer|owner|unrestricted|DAN|jailbroken|different (ai|assistant))\b/i,
  /\b(jailbreak|DAN mode|developer mode|god mode)\b/i,
  /<\/?(system|assistant|instructions?)>/i,
  /\bBEGIN (SYSTEM|INSTRUCTIONS)\b/i,
  /\b(api|secret|service[- ]role)\s*key\b/i,
];

// Personal details a customer typed. Redacted before the text goes to the model.
// The stored support message keeps the original for the human teammate.
const PII_REDACTIONS: Array<[RegExp, string]> = [
  [/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, "[email removed]"],
  [/(?:\+?1[\s.-]?)?\(?\d{3}\)?[\s.-]?\d{3}[\s.-]?\d{4}\b/g, "[phone removed]"],
  [/\b\d{1,6}\s+(?:[A-Za-z0-9.'-]+\s+){0,4}(?:Street|St|Avenue|Ave|Road|Rd|Drive|Dr|Lane|Ln|Boulevard|Blvd|Court|Ct|Way|Circle|Cir|Parkway|Pkwy|Place|Pl|Trail|Trl|Highway|Hwy)\b\.?(?:\s*(?:Apt|Unit|Suite|Ste|#)\s*[A-Za-z0-9-]+)?/gi, "[address removed]"],
  [/\b(?:\d[ -]?){13,19}\b/g, "[number removed]"],
  [/\b\d{3}-\d{2}-\d{4}\b/g, "[number removed]"],
];

export function redactPersonalDetails(text: string): string {
  let out = text;
  for (const [pattern, replacement] of PII_REDACTIONS) out = out.replace(pattern, replacement);
  return out;
}

export function looksLikePromptInjection(text: string): boolean {
  return INJECTION.some((pattern) => pattern.test(text));
}

export type GuardDecision = { action: "answer" } | { action: "refuse"; message: string };

export function classifyCustomerMessage(text: string): GuardDecision {
  const value = text.trim();
  if (looksLikePromptInjection(value)) {
    return { action: "refuse", message: INJECTION_REFUSAL };
  }
  if (COMPLAINT.some((pattern) => pattern.test(value))) {
    return { action: "refuse", message: COMPLAINT_HANDOFF };
  }
  if (ACCOUNT_ACTION.some((pattern) => pattern.test(value))) {
    return { action: "refuse", message: HUMAN_HANDOFF };
  }
  return { action: "answer" };
}

export function sanitizeAssistantReply(text: string): { text: string; blocked: boolean } {
  // PPP's own mailbox becomes the Contact us page; the mailing address is allowed;
  // everything else that looks like contact details is blocked.
  const value = text
    .trim()
    .replace(PPP_EMAIL, PPP_CONTACT_PAGE)
    .replace(EMAIL_VERB_BEFORE_CONTACT, (match) => (match[0] === match[0].toUpperCase() ? "Use " : "use "));
  const checked = ALLOWED_CONTACT.reduce((acc, pattern) => acc.replace(pattern, " "), value);
  if (!value || LEAK.some((pattern) => pattern.test(checked)) || affirmativeDutyClaim(value)) {
    return { text: HUMAN_HANDOFF, blocked: true };
  }
  return { text: value, blocked: false };
}

function affirmativeDutyClaim(text: string): boolean {
  return text.split(/(?<=[.!?])\s+/).some((sentence) => AFFIRMATIVE_DUTY.some((pattern) => pattern.test(sentence)));
}

export function containsLegacyFeeLanguage(text: string): boolean {
  return /contractor_fee|\b7\s*%|\bbps\b/i.test(text);
}
