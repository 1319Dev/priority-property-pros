/**
 * Operating-cost estimate for Priority Help.
 * List prices checked 2026-10-10. Uncached text tokens. No batch discount.
 * Full-text retrieval has no embedding cost.
 *
 * A typical conversation is 4 answers. Each turn resends the system prompt,
 * the live pricing block, up to four knowledge excerpts, and the growing
 * history. Planning totals: 5,500 input tokens and 750 output tokens.
 *
 * Sources:
 * - gpt-4.1-nano input $0.10 / 1M, output $0.40 / 1M
 *   https://developers.openai.com/api/docs/models/gpt-4.1-nano
 *   https://developers.openai.com/api/docs/pricing
 * - gpt-4o-mini input $0.15 / 1M, output $0.60 / 1M
 *   https://developers.openai.com/api/docs/models/gpt-4o-mini
 * - gemini-2.5-flash-lite input $0.10 / 1M, output $0.40 / 1M (paid tier, text)
 *   https://ai.google.dev/gemini-api/docs/pricing
 */

export const TYPICAL_INPUT_TOKENS = 5500;
export const TYPICAL_OUTPUT_TOKENS = 750;

export type ModelPrice = {
  id: string;
  label: string;
  inputPerMillionUsd: number;
  outputPerMillionUsd: number;
  sourceUrl: string;
  pricedOn: "2026-10-10";
};

export const MODEL_PRICES: readonly ModelPrice[] = [
  {
    id: "gpt-4.1-nano",
    label: "GPT-4.1 nano",
    inputPerMillionUsd: 0.1,
    outputPerMillionUsd: 0.4,
    sourceUrl: "https://developers.openai.com/api/docs/models/gpt-4.1-nano",
    pricedOn: "2026-10-10",
  },
  {
    id: "gpt-4o-mini",
    label: "GPT-4o mini",
    inputPerMillionUsd: 0.15,
    outputPerMillionUsd: 0.6,
    sourceUrl: "https://developers.openai.com/api/docs/models/gpt-4o-mini",
    pricedOn: "2026-10-10",
  },
  {
    id: "gemini-2.5-flash-lite",
    label: "Gemini 2.5 Flash-Lite",
    inputPerMillionUsd: 0.1,
    outputPerMillionUsd: 0.4,
    sourceUrl: "https://ai.google.dev/gemini-api/docs/pricing",
    pricedOn: "2026-10-10",
  },
];

export function costPerConversationUsd(price: ModelPrice): number {
  const input = (TYPICAL_INPUT_TOKENS / 1_000_000) * price.inputPerMillionUsd;
  const output = (TYPICAL_OUTPUT_TOKENS / 1_000_000) * price.outputPerMillionUsd;
  return input + output;
}

export function monthlyCostUsd(price: ModelPrice, conversations: number): number {
  return costPerConversationUsd(price) * conversations;
}
