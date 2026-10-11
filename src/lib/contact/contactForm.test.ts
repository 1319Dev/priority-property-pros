import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { SUPPORT_EMAIL } from "../../data/brand";
import {
  CONTACT_VALIDATION_ERROR,
  DEFAULT_CONTACT_FROM,
  DEFAULT_CONTACT_TO,
  buildContactEmailText,
  contactUnavailableError,
  handleContactForm,
  hashContactIp,
  isAllowedContactOrigin,
  parseContactSubmission,
  stripContactHtml,
} from "../../../supabase/functions/_shared/contactForm";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const SECRET = "UNIQUE-SECRET-PHRASE-7781 fence gate code 4455";

const valid = {
  name: "Ada Lovelace",
  email: "ada@example.com",
  phone: "936-555-0100",
  topic: "marketplace",
  message: `<b>${SECRET}</b> and <script>alert(1)</script> please.`,
  company_website: "",
};

function runtime(fetchImpl: typeof fetch, extras?: { resendApiKey?: string; service?: { url: string; key: string } | null }) {
  return {
    resendApiKey: extras && "resendApiKey" in extras ? extras.resendApiKey ?? "" : "re_test",
    toEmail: DEFAULT_CONTACT_TO,
    fromEmail: DEFAULT_CONTACT_FROM,
    ipHashSalt: "salt-1",
    service: extras && "service" in extras ? extras.service ?? null : { url: "https://example.supabase.co", key: "service-key" },
    fetchImpl,
  };
}

function request(body: unknown, origin = "https://prioritypropertypros.com") {
  return new Request("https://example.supabase.co/functions/v1/contact-form", {
    method: "POST",
    headers: { origin, "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

function mockFetch(options?: { allow?: boolean; resendStatus?: number }) {
  const calls: Array<{ url: string; init: RequestInit }> = [];
  const fetchImpl: typeof fetch = async (input, init) => {
    const url = String(input);
    calls.push({ url, init: init ?? {} });
    if (url.includes("/rpc/consume_contact_rate_bucket")) {
      return new Response(JSON.stringify(options?.allow !== false), { status: 200 });
    }
    if (url.includes("/contact_messages") && init?.method === "POST") {
      return new Response(JSON.stringify([{ id: "msg-1" }]), { status: 201 });
    }
    if (url.includes("/contact_messages") && init?.method === "PATCH") {
      return new Response("", { status: 204 });
    }
    if (url.includes("api.resend.com")) {
      return new Response(JSON.stringify({ id: "email_1" }), { status: options?.resendStatus ?? 200 });
    }
    return new Response("missing", { status: 500 });
  };
  return { calls, fetchImpl };
}

describe("contact form handler", () => {
  it("allows the public site and localhost, and rejects other origins", () => {
    expect(isAllowedContactOrigin("https://prioritypropertypros.com")).toBe(true);
    expect(isAllowedContactOrigin("https://www.prioritypropertypros.com")).toBe(true);
    expect(isAllowedContactOrigin("http://localhost:5173")).toBe(true);
    expect(isAllowedContactOrigin("http://127.0.0.1:4173")).toBe(true);
    expect(isAllowedContactOrigin("http://prioritypropertypros.com")).toBe(false);
    expect(isAllowedContactOrigin("https://prioritypropertypros.com.evil.test")).toBe(false);
    expect(isAllowedContactOrigin("https://evil.example")).toBe(false);
    expect(isAllowedContactOrigin(null)).toBe(false);
  });

  it("strips tags and keeps the plain sentence", () => {
    expect(stripContactHtml("<b>Hello</b> <script>alert(1)</script>")).toBe("Hello alert(1)");
    expect(stripContactHtml("<b>Hello</b>")).not.toContain("<");
  });

  it("sends plain text through Resend with Reply-To and does not echo the message", async () => {
    const { calls, fetchImpl } = mockFetch();
    const response = await handleContactForm(request(valid), runtime(fetchImpl));
    expect(response.status).toBe(200);
    expect(response.headers.get("access-control-allow-origin")).toBe("https://prioritypropertypros.com");
    expect(response.headers.get("access-control-allow-origin")).not.toBe("*");
    const payload = await response.json();
    expect(payload).toEqual({ ok: true });
    expect(JSON.stringify(payload)).not.toContain(SECRET);

    const resend = calls.find((call) => call.url.includes("api.resend.com"));
    expect(resend).toBeTruthy();
    const body = JSON.parse(String(resend?.init.body));
    expect(body.from).toBe(DEFAULT_CONTACT_FROM);
    expect(body.to).toEqual([SUPPORT_EMAIL]);
    expect(body.reply_to).toBe("ada@example.com");
    expect(body.subject).toBe("Contact form: Marketplace question");
    expect(body.text).toContain("Ada Lovelace");
    expect(body.text).toContain(SECRET);
    expect(body.text).not.toContain("<script");
    expect(body.text).not.toContain("<b>");
    expect(body.html).toBeUndefined();
    expect(body.text).toBe(
      buildContactEmailText({
        name: "Ada Lovelace",
        email: "ada@example.com",
        phone: "936-555-0100",
        topic: "marketplace",
        message: `${SECRET} and alert(1) please.`,
      }),
    );

    const insert = calls.find((call) => call.url.endsWith("/contact_messages") && call.init.method === "POST");
    const stored = JSON.parse(String(insert?.init.body));
    expect(stored.message).not.toContain("<");
    expect(stored.ip_hash).toMatch(/^[a-f0-9]{64}$/);
    expect(stored.ip_hash).not.toContain("127.0.0.1");
  });

  it("stores the note and skips Resend when the API key is missing", async () => {
    const { calls, fetchImpl } = mockFetch();
    const response = await handleContactForm(request(valid), runtime(fetchImpl, { resendApiKey: "" }));
    expect(response.status).toBe(503);
    const payload = await response.json();
    expect(payload).toEqual({ ok: false, code: "unavailable", error: contactUnavailableError(SUPPORT_EMAIL) });
    expect(JSON.stringify(payload)).not.toContain(SECRET);
    expect(calls.some((call) => call.url.includes("api.resend.com"))).toBe(false);
    const patch = calls.find((call) => call.init.method === "PATCH");
    expect(JSON.parse(String(patch?.init.body))).toEqual({ email_status: "unavailable" });
  });

  it("keeps a failed send in the table and does not echo the message", async () => {
    const { calls, fetchImpl } = mockFetch({ resendStatus: 422 });
    const response = await handleContactForm(request(valid), runtime(fetchImpl));
    expect(response.status).toBe(502);
    const payload = await response.json();
    expect(payload.code).toBe("send_failed");
    expect(JSON.stringify(payload)).not.toContain(SECRET);
    expect(JSON.parse(String(calls.find((call) => call.init.method === "PATCH")?.init.body))).toEqual({
      email_status: "failed",
    });
  });

  it("rate limits before storing and does not echo the message", async () => {
    const { calls, fetchImpl } = mockFetch({ allow: false });
    const response = await handleContactForm(request(valid), runtime(fetchImpl));
    expect(response.status).toBe(429);
    const payload = await response.json();
    expect(payload.code).toBe("rate_limited");
    expect(JSON.stringify(payload)).not.toContain(SECRET);
    expect(calls.some((call) => call.url.includes("api.resend.com"))).toBe(false);
    expect(calls.some((call) => call.url.includes("/contact_messages"))).toBe(false);
  });

  it("accepts a honeypot without storing or emailing", async () => {
    const { calls, fetchImpl } = mockFetch();
    const response = await handleContactForm(
      request({ ...valid, company_website: "https://spam.example" }),
      runtime(fetchImpl),
    );
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ ok: true });
    expect(calls.some((call) => call.url.includes("/contact_messages"))).toBe(false);
    expect(calls.some((call) => call.url.includes("api.resend.com"))).toBe(false);
  });

  it("rejects a bad topic without echoing the message", async () => {
    const { fetchImpl } = mockFetch();
    const response = await handleContactForm(request({ ...valid, topic: "nope" }), runtime(fetchImpl));
    expect(response.status).toBe(400);
    const payload = await response.json();
    expect(payload).toEqual({ ok: false, code: "validation", error: CONTACT_VALIDATION_ERROR, field: "topic" });
    expect(JSON.stringify(payload)).not.toContain(SECRET);
  });

  it("rejects a disallowed origin before reading it back", async () => {
    const { calls, fetchImpl } = mockFetch();
    const response = await handleContactForm(request(valid, "https://evil.example"), runtime(fetchImpl));
    expect(response.status).toBe(403);
    expect(response.headers.get("access-control-allow-origin")).toBeNull();
    expect(await response.text()).not.toContain(SECRET);
    expect(calls).toHaveLength(0);
  });

  it("hashes the IP with the salt and never returns the raw address", async () => {
    const left = await hashContactIp("203.0.113.8", "salt-1");
    const right = await hashContactIp("203.0.113.8", "salt-2");
    expect(left).not.toBe(right);
    expect(left).not.toContain("203.0.113.8");
    expect(await hashContactIp("203.0.113.8", "salt-1")).toBe(left);
  });

  it("rejects an empty message and a short phone", () => {
    expect(parseContactSubmission({ ...valid, message: "short" }).ok).toBe(false);
    expect(parseContactSubmission({ ...valid, phone: "12" }).ok).toBe(false);
    expect(parseContactSubmission({ ...valid, phone: "" })).toMatchObject({ ok: true, honeypot: false });
  });

  it("wires Resend, the verified from-address, and signed-out access", () => {
    const index = readFileSync(path.join(root, "supabase/functions/contact-form/index.ts"), "utf8");
    const config = readFileSync(path.join(root, "supabase/config.toml"), "utf8");
    expect(index).toContain("loadNotificationRuntimeSecrets");
    expect(index).toContain("CONTACT_TO_EMAIL");
    expect(index).toContain("resendApiKey");
    expect(index).toContain("CONTACT_IP_HASH_SALT");
    expect(DEFAULT_CONTACT_TO).toBe(SUPPORT_EMAIL);
    expect(DEFAULT_CONTACT_FROM).toContain("@prioritypropertypros.com");
    expect(config).toMatch(/\[functions\.contact-form\]\s*verify_jwt = false/);
  });
});
