import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { monthlyCostUsd, MODEL_PRICES, TYPICAL_INPUT_TOKENS, TYPICAL_OUTPUT_TOKENS } from "../../../supabase/functions/_shared/priorityHelp/costEstimate";
import { classifyCustomerMessage, containsLegacyFeeLanguage, HUMAN_HANDOFF, sanitizeAssistantReply } from "../../../supabase/functions/_shared/priorityHelp/guardrails";
import { handlePriorityHelp, sha256Hex, type PriorityHelpDeps, type RpcResult } from "../../../supabase/functions/_shared/priorityHelp/handler";
import { formatLivePricing } from "../../../supabase/functions/_shared/priorityHelp/pricing";
import { buildPrompt } from "../../../supabase/functions/_shared/priorityHelp/prompt";
import { chatCompletionsUrl, completeChat } from "../../../supabase/functions/_shared/priorityHelp/provider";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const conversationId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";

function pricing() {
  return {
    signup_fee_cents: 999,
    signup_fee_enabled: true,
    connection_fee_cents: 499,
    connection_fee_enabled: true,
    payments_live: false,
    charges_live: false,
  };
}

function deps(overrides: Partial<PriorityHelpDeps> = {}): PriorityHelpDeps & { calls: Array<{ name: string; args: Record<string, unknown> }>; fetches: unknown[] } {
  const calls: Array<{ name: string; args: Record<string, unknown> }> = [];
  const fetches: unknown[] = [];
  const env: Record<string, string> = {
    PRIORITY_HELP_AI_API_KEY: "sk-test",
    PRIORITY_HELP_AI_MODEL: "gpt-4.1-nano",
  };
  const rpc = async (name: string, args: Record<string, unknown>): Promise<RpcResult> => {
    calls.push({ name, args });
    if (name === "support_service_open") {
      return {
        data: {
          id: conversationId,
          status: "ASSISTANT",
          messages: [],
          human_joined: false,
          availability: "offline",
          reference: null,
        },
        error: null,
      };
    }
    if (name === "support_service_context") {
      return {
        data: {
          pricing: pricing(),
          articles: [{ slug: "payments-and-fees", title: "Payments and fees", excerpt: "Activation is a one-time fee. There is no commission." }],
          availability: "offline",
        },
        error: null,
      };
    }
    if (name === "support_service_customer_message") {
      return { data: { id: conversationId, messages: [{ role: "customer", body: args.p_body }], human_joined: false }, error: null };
    }
    if (name === "support_service_assistant_message" || name === "support_service_escalate") {
      return {
        data: { id: conversationId, reference: "PH-10001", human_joined: false, availability: "offline", messages: [] },
        error: null,
      };
    }
    return { data: null, error: "unexpected rpc" };
  };
  return {
    calls,
    fetches,
    env: (key) => (overrides.env ? overrides.env(key) : env[key]),
    rpc: overrides.rpc ?? rpc,
    userIdFromAuthorization: overrides.userIdFromAuthorization ?? (async () => null),
    fetchImpl: overrides.fetchImpl ?? (async (_url, init) => {
      fetches.push(JSON.parse(String(init?.body ?? "{}")));
      return new Response(JSON.stringify({ choices: [{ message: { content: "Activation is a one-time $9.99 fee. Connect is $4.99. There is no commission." } }], usage: { prompt_tokens: 100, completion_tokens: 40 } }), { status: 200 });
    }),
    randomToken: () => "guest-token-one",
  };
}

async function post(body: unknown, harness = deps(), authorization = ""): Promise<{ status: number; json: Record<string, unknown> }> {
  const response = await handlePriorityHelp(
    new Request("https://priority-help.local", {
      method: "POST",
      headers: authorization ? { Authorization: authorization } : undefined,
      body: JSON.stringify(body),
    }),
    harness,
  );
  return { status: response.status, json: (await response.json()) as Record<string, unknown> };
}

describe("Priority Help guardrails and pricing", () => {
  it("quotes live activation and Connect amounts and never a percentage fee", () => {
    const text = formatLivePricing(pricing());
    expect(text).toContain("$9.99");
    expect(text).toContain("$4.99");
    expect(text).toContain("no commission");
    expect(containsLegacyFeeLanguage(text)).toBe(false);
    expect(text).not.toMatch(/700/);
  });

  it("refuses refunds, approvals, and account lookups, and answers how-to questions", () => {
    expect(classifyCustomerMessage("Refund my activation").action).toBe("refuse");
    expect(classifyCustomerMessage("Please approve my contractor application").action).toBe("refuse");
    expect(classifyCustomerMessage("What is the status of my payment?").action).toBe("refuse");
    expect(classifyCustomerMessage("Look up PPP-1004").action).toBe("refuse");
    expect(classifyCustomerMessage("What is their business name?").action).toBe("refuse");
    expect(classifyCustomerMessage("How do I post a project?").action).toBe("answer");
    expect(classifyCustomerMessage("Is there a commission?").action).toBe("answer");
    expect(classifyCustomerMessage("How does contractor approval work?").action).toBe("answer");
  });

  it("replaces leaked contact details and legacy fee language", () => {
    expect(sanitizeAssistantReply("Email ada@example.com and I approved the refund.").blocked).toBe(true);
    expect(sanitizeAssistantReply("The contractor fee is 7%.").text).toBe(HUMAN_HANDOFF);
    expect(sanitizeAssistantReply("Activation is a one-time fee.").blocked).toBe(false);
  });

  it("keeps the legacy fee setting out of the model prompt", () => {
    const messages = buildPrompt({
      pricing: pricing(),
      articles: [{ title: "Payments and fees", excerpt: "No commission." }],
      history: [],
      question: "How much is activation?",
    });
    const joined = messages.map((message) => message.content).join("\n");
    expect(joined).toContain("$9.99");
    expect(joined).toContain("$4.99");
    expect(joined).not.toMatch(/contractor_fee/);
    expect(joined).not.toMatch(/\b700\b/);
    expect(joined).not.toMatch(/function_call|tool_choice/);
  });
});

describe("Priority Help Edge Function", () => {
  it("issues a guest token and does not call the model when the key is missing", async () => {
    const harness = deps({ env: (key) => (key === "PRIORITY_HELP_AI_API_KEY" ? "" : undefined) });
    const opened = await post({ action: "open" }, harness);
    expect(opened.json.mode).toBe("human_only");
    expect(opened.json.guestToken).toBe("guest-token-one");
    expect(harness.fetches).toHaveLength(0);
    const sent = await post({ action: "send", guestToken: "guest-token-one", body: "How much is activation?" }, harness);
    expect(sent.json.mode).toBe("human_only");
    expect(sent.json.answer).toBeNull();
    expect(harness.fetches).toHaveLength(0);
    expect(harness.calls.some((call) => call.name === "support_service_assistant_message")).toBe(false);
  });

  it("answers from the mocked model and stores both messages", async () => {
    const harness = deps();
    const sent = await post({ action: "send", guestToken: "guest-token-one", body: "How much is activation?" }, harness);
    expect(sent.status).toBe(200);
    expect(sent.json.answer).toMatch(/\$9\.99/);
    expect(sent.json.humanJoined).toBe(false);
    const prompt = harness.fetches[0] as { model: string; messages: Array<{ content: string }>; tools?: unknown };
    expect(prompt.model).toBe("gpt-4.1-nano");
    expect(prompt.tools).toBeUndefined();
    expect(prompt.messages.map((message) => message.content).join("\n")).toContain("$9.99");
    expect(harness.calls.map((call) => call.name)).toEqual([
      "support_service_open",
      "support_service_customer_message",
      "support_service_context",
      "support_service_assistant_message",
    ]);
    const hash = await sha256Hex("guest-token-one");
    expect(harness.calls[0]?.args.p_guest_token_hash).toBe(hash);
    expect(JSON.stringify(harness.calls)).not.toContain("guest-token-one");
  });

  it("does not call the model for a refund request", async () => {
    const harness = deps();
    const sent = await post({ action: "send", guestToken: "guest-token-one", body: "Refund my $9.99 activation" }, harness);
    expect(sent.json.refusal).toBe(HUMAN_HANDOFF);
    expect(harness.fetches).toHaveLength(0);
    expect(harness.calls.some((call) => call.name === "support_service_assistant_message")).toBe(true);
  });

  it("drops a honeypot without opening a conversation or calling the model", async () => {
    const harness = deps();
    const sent = await post({ action: "send", body: "hello", company_website: "https://spam.example" }, harness);
    expect(sent.json.ok).toBe(true);
    expect(harness.calls).toHaveLength(0);
    expect(harness.fetches).toHaveLength(0);
  });

  it("replaces a model answer that leaks an email address", async () => {
    const harness = deps({
      fetchImpl: async () =>
        new Response(JSON.stringify({ choices: [{ message: { content: "Write to ada@example.com and we refunded you." } }] }), { status: 200 }),
    });
    const sent = await post({ action: "send", guestToken: "guest-token-one", body: "How do reviews work?" }, harness);
    expect(sent.json.answer).toBe(HUMAN_HANDOFF);
    const saved = harness.calls.find((call) => call.name === "support_service_assistant_message");
    expect(saved?.args.p_body).toBe(HUMAN_HANDOFF);
  });

  it("creates a ticket without claiming a person has joined", async () => {
    const harness = deps();
    const sent = await post({ action: "escalate", guestToken: "guest-token-one", body: "Please call me back." }, harness);
    expect(sent.json.reference).toBe("PH-10001");
    expect(sent.json.humanJoined).toBe(false);
    expect(harness.fetches).toHaveLength(0);
  });

  it("uses the signed-in user and ignores a guest token on the same request", async () => {
    const harness = deps({ userIdFromAuthorization: async () => "11111111-1111-4111-8111-111111111111" });
    await post({ action: "open", guestToken: "someone-elses-token" }, harness, "Bearer user-jwt");
    expect(harness.calls[0]?.args.p_user_id).toBe("11111111-1111-4111-8111-111111111111");
    expect(harness.calls[0]?.args.p_guest_token_hash).toBeNull();
  });

  it("requires Turnstile only when the secret is set", async () => {
    const harness = deps({
      env: (key) => {
        if (key === "PRIORITY_HELP_TURNSTILE_SECRET") return "turnstile-secret";
        if (key === "PRIORITY_HELP_AI_API_KEY") return "";
        return undefined;
      },
      fetchImpl: async () => new Response(JSON.stringify({ success: false }), { status: 200 }),
    });
    const missing = await post({ action: "open" }, harness);
    expect(missing.status).toBe(400);
    expect(missing.json.error).toBe("turnstile required");
    const failed = await post({ action: "open", turnstileToken: "bad" }, harness);
    expect(failed.status).toBe(400);
  });

  it("does not put provider failures or the API key in the response", async () => {
    const harness = deps({
      fetchImpl: async () => new Response("sk-test upstream exploded", { status: 500 }),
    });
    const sent = await post({ action: "send", guestToken: "guest-token-one", body: "How do I find a pro?" }, harness);
    expect(JSON.stringify(sent.json)).not.toContain("sk-test");
    expect(JSON.stringify(sent.json)).not.toContain("exploded");
    expect(sent.json.answer).toMatch(/Talk to Support/);
  });
});

describe("Priority Help provider and cost", () => {
  it("posts chat completions with no tools", async () => {
    let captured: { url: string; body: Record<string, unknown>; authorization: string } | undefined;
    await completeChat({
      apiKey: "sk-test",
      model: "gpt-4.1-nano",
      baseUrl: "https://api.openai.com/v1/",
      messages: [{ role: "user", content: "Hi" }],
      fetchImpl: async (url, init) => {
        captured = {
          url: String(url),
          body: JSON.parse(String(init?.body)),
          authorization: new Headers(init?.headers).get("Authorization") ?? "",
        };
        return new Response(JSON.stringify({ choices: [{ message: { content: "Hello" } }] }), { status: 200 });
      },
    });
    expect(chatCompletionsUrl("https://example.com/v1")).toBe("https://example.com/v1/chat/completions");
    expect(captured?.url).toBe("https://api.openai.com/v1/chat/completions");
    expect(captured?.body.tools).toBeUndefined();
    expect(captured?.authorization).toBe("Bearer sk-test");
  });

  it("prices a typical conversation at the published cheap-model rates", () => {
    expect(TYPICAL_INPUT_TOKENS).toBe(5500);
    expect(TYPICAL_OUTPUT_TOKENS).toBe(750);
    const nano = MODEL_PRICES[0];
    const mini = MODEL_PRICES[1];
    const flash = MODEL_PRICES[2];
    expect(nano && monthlyCostUsd(nano, 1)).toBeCloseTo(0.00085, 8);
    expect(nano && monthlyCostUsd(nano, 100)).toBeCloseTo(0.085, 6);
    expect(nano && monthlyCostUsd(nano, 1000)).toBeCloseTo(0.85, 6);
    expect(nano && monthlyCostUsd(nano, 10000)).toBeCloseTo(8.5, 6);
    expect(mini && monthlyCostUsd(mini, 10000)).toBeCloseTo(12.75, 6);
    expect(flash && monthlyCostUsd(flash, 10000)).toBeCloseTo(8.5, 6);
    expect(MODEL_PRICES.every((price) => price.pricedOn === "2026-10-10" && price.sourceUrl.startsWith("https://"))).toBe(true);
  });

  it("keeps the service-role key and the AI key out of the client and the repo function", () => {
    const index = readFileSync(path.join(root, "supabase/functions/priority-help/index.ts"), "utf8");
    const config = readFileSync(path.join(root, "supabase/config.toml"), "utf8");
    expect(index).toMatch(/PRIORITY_HELP_AI_API_KEY|env: \(key\)/);
    expect(index).not.toMatch(/sk-[A-Za-z0-9]{8,}/);
    expect(index).not.toMatch(/SUPABASE_SERVICE_ROLE_KEY\s*=\s*["']/);
    expect(config).toMatch(/\[functions\.priority-help\]/);
    expect(config).toMatch(/verify_jwt = false/);
    expect(config).toMatch(/PRIORITY_HELP_AI_API_KEY/);
    expect(config).toMatch(/PRIORITY_HELP_TURNSTILE_SECRET/);
  });
});
