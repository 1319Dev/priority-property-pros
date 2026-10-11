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
];

export type GuardDecision = { action: "answer" } | { action: "refuse"; message: string };

export function classifyCustomerMessage(text: string): GuardDecision {
  const value = text.trim();
  if (COMPLAINT.some((pattern) => pattern.test(value))) {
    return { action: "refuse", message: COMPLAINT_HANDOFF };
  }
  if (ACCOUNT_ACTION.some((pattern) => pattern.test(value))) {
    return { action: "refuse", message: HUMAN_HANDOFF };
  }
  return { action: "answer" };
}

export function sanitizeAssistantReply(text: string): { text: string; blocked: boolean } {
  const value = text.trim();
  if (!value || LEAK.some((pattern) => pattern.test(value)) || affirmativeDutyClaim(value)) {
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
