import { HUMAN_HANDOFF } from "./guardrails";
import { formatLivePricing, type LivePricing } from "./pricing";
import type { ChatMessage } from "./provider";

export type KbExcerpt = {
  title: string;
  excerpt: string;
  slug?: string;
};

const RULES = [
  "You are Priority Help, the support assistant for Priority Property Pros.",
  "Answer only from the live pricing block and the knowledge excerpts.",
  "If those sources do not answer the question, say you do not have that and tell the person to choose Talk to Support.",
  "Never invent an account balance, a payment, a refund, a guarantee, a license, insurance, a rating, a credential, or a policy.",
  "Never reveal a phone number, an email address, a street address, a private project, or a contractor business name.",
  "Business names stay hidden on Find a Pro until that contractor pays Connect on a project.",
  "You have no tools. You cannot approve a contractor, refund a payment, or change an account.",
  "Do not say a person is in this chat. A teammate joins only after they take the ticket.",
  HUMAN_HANDOFF,
].join(" ");

export function buildPrompt(input: {
  pricing: LivePricing;
  articles: KbExcerpt[];
  history: Array<{ role: "customer" | "assistant" | "admin" | "system"; body: string }>;
  question: string;
}): ChatMessage[] {
  const excerpts = input.articles.length
    ? input.articles
        .slice(0, 4)
        .map((article) => `## ${article.title}\n${article.excerpt}`)
        .join("\n\n")
    : "No knowledge-base excerpt matched this question.";
  const messages: ChatMessage[] = [
    { role: "system", content: `${RULES}\n\n${formatLivePricing(input.pricing)}\n\nKnowledge excerpts:\n${excerpts}` },
  ];
  for (const item of input.history.slice(-8)) {
    if (item.role === "admin" || item.role === "system") continue;
    messages.push({
      role: item.role === "assistant" ? "assistant" : "user",
      content: item.body,
    });
  }
  messages.push({ role: "user", content: input.question });
  return messages;
}
