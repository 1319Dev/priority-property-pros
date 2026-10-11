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

const ACCOUNT_ACTION: RegExp[] = [
  /\brefund/i,
  /\bchargebacks?\b/i,
  /\bapprove\b/i,
  /\breject (my|this|the)\b/i,
  /\b(change|update|reset) my (email|password|phone|account|card)\b/i,
  /\bmy (payment|receipt|card|password|invoice)\b/i,
  /\b(did|has) my (payment|activation|connect)\b/i,
  /\bstatus of my\b/i,
  /\blook\s*up\b/i,
  /\bPPP-\d+\b/i,
  /\bguarantee\b/i,
  /\bbusiness name\b/i,
  /\btheir (phone|email|number|address)\b/i,
  /\b(phone|email) (number|address)\b/i,
  /\bdelete my account\b/i,
  /\bcancel my account\b/i,
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
  if (ACCOUNT_ACTION.some((pattern) => pattern.test(value))) {
    return { action: "refuse", message: HUMAN_HANDOFF };
  }
  return { action: "answer" };
}

export function sanitizeAssistantReply(text: string): { text: string; blocked: boolean } {
  const value = text.trim();
  if (!value || LEAK.some((pattern) => pattern.test(value))) {
    return { text: HUMAN_HANDOFF, blocked: true };
  }
  return { text: value, blocked: false };
}

export function containsLegacyFeeLanguage(text: string): boolean {
  return /contractor_fee|\b7\s*%|\bbps\b/i.test(text);
}
