export const DEFAULT_PRIORITY_HELP_MODEL = "gpt-4.1-nano";
export const DEFAULT_PRIORITY_HELP_BASE_URL = "https://api.openai.com/v1";

export type ChatMessage = {
  role: "system" | "user" | "assistant";
  content: string;
};

export type ChatResult = {
  text: string;
  inputTokens: number | null;
  outputTokens: number | null;
};

export class ProviderError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ProviderError";
  }
}

export function chatCompletionsUrl(baseUrl: string): string {
  const trimmed = baseUrl.trim().replace(/\/$/, "");
  if (!trimmed) return `${DEFAULT_PRIORITY_HELP_BASE_URL}/chat/completions`;
  if (trimmed.endsWith("/chat/completions")) return trimmed;
  return `${trimmed}/chat/completions`;
}

/**
 * OpenAI-compatible chat completions. No tools, no function calls.
 * Pass a different base URL for a provider that speaks the same API.
 */
export async function completeChat(input: {
  apiKey: string;
  model: string;
  baseUrl: string;
  messages: ChatMessage[];
  fetchImpl: typeof fetch;
  maxTokens?: number;
}): Promise<ChatResult> {
  const response = await input.fetchImpl(chatCompletionsUrl(input.baseUrl), {
    method: "POST",
    headers: {
      Authorization: `Bearer ${input.apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: input.model,
      temperature: 0.2,
      max_tokens: input.maxTokens ?? 500,
      messages: input.messages,
    }),
  });
  const raw = await response.text();
  if (!response.ok) {
    throw new ProviderError(`provider status ${response.status}`);
  }
  let parsed: {
    choices?: Array<{ message?: { content?: string | null } }>;
    usage?: { prompt_tokens?: number; completion_tokens?: number };
  };
  try {
    parsed = JSON.parse(raw) as typeof parsed;
  } catch {
    throw new ProviderError("provider returned invalid JSON");
  }
  const text = parsed.choices?.[0]?.message?.content?.trim() ?? "";
  if (!text) throw new ProviderError("provider returned an empty answer");
  return {
    text,
    inputTokens: typeof parsed.usage?.prompt_tokens === "number" ? parsed.usage.prompt_tokens : null,
    outputTokens: typeof parsed.usage?.completion_tokens === "number" ? parsed.usage.completion_tokens : null,
  };
}
