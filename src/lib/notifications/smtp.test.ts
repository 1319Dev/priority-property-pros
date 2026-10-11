import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { buildNotificationEmail } from "./policy";
import {
  SmtpError,
  buildMimeMessage,
  dotStuff,
  encodeHeaderText,
  parseMailbox,
  resolveSmtpConfig,
  sendSmtpMail,
  type SmtpConfig,
  type SmtpConnection,
} from "../../../supabase/functions/_shared/smtp";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const readRepo = (file: string) => readFileSync(path.join(repoRoot, file), "utf8");

const CONFIG: SmtpConfig = {
  host: "smtp.gmail.com",
  port: 465,
  username: "support@prioritypropertypros.com",
  password: "abcdefghijklmnop",
};

type Overrides = Partial<Record<"greeting" | "ehlo" | "auth" | "mail" | "rcpt" | "data" | "send" | "quit", string>>;

/** Scripted SMTP server speaking over an in-memory connection. */
class MockSmtpServer {
  commands: string[] = [];
  data = "";
  closed = false;
  connectedTo: { host: string; port: number } | null = null;
  private overrides: Overrides;
  private outbox: Uint8Array[] = [];
  private waiters: (() => void)[] = [];
  private inData = false;
  private pending = "";
  private encoder = new TextEncoder();
  private decoder = new TextDecoder();
  private silent: boolean;

  constructor(overrides: Overrides = {}, options: { silent?: boolean } = {}) {
    this.overrides = overrides;
    this.silent = options.silent ?? false;
  }

  connect = async (host: string, port: number): Promise<SmtpConnection> => {
    this.connectedTo = { host, port };
    if (!this.silent) this.send(this.overrides.greeting ?? "220 smtp.gmail.com ESMTP ready");
    return {
      read: (buffer) => this.read(buffer),
      write: async (bytes) => {
        this.receive(this.decoder.decode(bytes));
        return bytes.length;
      },
      close: () => {
        this.closed = true;
        this.flushWaiters();
      },
    };
  };

  private send(reply: string) {
    this.outbox.push(this.encoder.encode(`${reply.split("\n").join("\r\n")}\r\n`));
    this.flushWaiters();
  }

  private flushWaiters() {
    const waiters = this.waiters;
    this.waiters = [];
    waiters.forEach((resolve) => resolve());
  }

  private async read(buffer: Uint8Array): Promise<number | null> {
    while (this.outbox.length === 0) {
      if (this.closed) return null;
      await new Promise<void>((resolve) => this.waiters.push(resolve));
    }
    const next = this.outbox.shift()!;
    const size = Math.min(buffer.length, next.length);
    buffer.set(next.subarray(0, size));
    if (size < next.length) this.outbox.unshift(next.subarray(size));
    return size;
  }

  private receive(chunk: string) {
    this.pending += chunk;
    if (this.inData) {
      const end = this.pending.indexOf("\r\n.\r\n");
      if (end < 0) return;
      this.data = this.pending.slice(0, end);
      this.pending = this.pending.slice(end + 5);
      this.inData = false;
      this.send(this.overrides.send ?? "250 2.0.0 OK queued");
    }
    let newline = this.pending.indexOf("\r\n");
    while (!this.inData && newline >= 0) {
      const line = this.pending.slice(0, newline);
      this.pending = this.pending.slice(newline + 2);
      this.commands.push(line);
      this.respond(line);
      newline = this.pending.indexOf("\r\n");
    }
  }

  private respond(line: string) {
    const verb = line.split(/[ :]/)[0].toUpperCase();
    if (verb === "EHLO") return this.send(this.overrides.ehlo ?? "250-smtp.gmail.com at your service\n250-SIZE 35882577\n250-AUTH LOGIN PLAIN XOAUTH2\n250 SMTPUTF8");
    if (verb === "AUTH") return this.send(this.overrides.auth ?? "235 2.7.0 Accepted");
    if (verb === "MAIL") return this.send(this.overrides.mail ?? "250 2.1.0 OK");
    if (verb === "RCPT") return this.send(this.overrides.rcpt ?? "250 2.1.5 OK");
    if (verb === "DATA") {
      const reply = this.overrides.data ?? "354 Go ahead";
      if (reply.startsWith("354")) this.inData = true;
      return this.send(reply);
    }
    if (verb === "QUIT") return this.send(this.overrides.quit ?? "221 2.0.0 closing connection");
    return this.send("500 unknown");
  }
}

function decodeBase64Utf8(value: string): string {
  const binary = atob(value.replace(/\s+/g, ""));
  return new TextDecoder().decode(Uint8Array.from(binary, (char) => char.charCodeAt(0)));
}

function mimeParts(message: string): Record<string, string> {
  const boundary = /boundary="([^"]+)"/.exec(message)![1];
  const parts: Record<string, string> = {};
  for (const section of message.split(`--${boundary}`)) {
    const type = /Content-Type: (text\/(?:plain|html))/.exec(section)?.[1];
    if (!type) continue;
    const body = section.split("\r\n\r\n").slice(1).join("\r\n\r\n");
    parts[type] = decodeBase64Utf8(body);
  }
  return parts;
}

function headerBlock(message: string): string {
  return message.slice(0, message.indexOf("\r\n\r\n"));
}

const sampleEmail = () =>
  buildNotificationEmail({
    kind: "estimate.received",
    title: "A new estimate is ready",
    body: "Open the project to review it.",
    itemUrl: "https://prioritypropertypros.com/app/customer/projects/p1",
    manageUrl: "https://prioritypropertypros.com/notifications",
    unsubscribeUrl: "https://example.supabase.co/functions/v1/notification-unsubscribe?token=abc",
  });

describe("SMTP configuration", () => {
  it("skips when any secret is missing", () => {
    for (const missing of ["host", "username", "password"] as const) {
      const input = { host: "smtp.gmail.com", port: "465", username: CONFIG.username, password: "pw", [missing]: "" };
      const result = resolveSmtpConfig(input);
      expect(result.ok).toBe(false);
    }
    expect(resolveSmtpConfig({})).toEqual({ ok: false, reason: "SMTP_HOST, SMTP_USER, or SMTP_PASS is not set" });
  });

  it("accepts Google Workspace on 465 and defaults the port to 465", () => {
    expect(resolveSmtpConfig({ host: " smtp.gmail.com ", port: "465", username: CONFIG.username, password: "abcd efgh ijkl mnop" })).toEqual({
      ok: true,
      config: CONFIG,
    });
    expect(resolveSmtpConfig({ host: "smtp.gmail.com", username: CONFIG.username, password: "x" })).toMatchObject({
      ok: true,
      config: { port: 465 },
    });
  });

  it("rejects ports the edge runtime blocks and malformed values", () => {
    for (const port of ["587", "25", "2525", "abc"]) {
      const result = resolveSmtpConfig({ host: "smtp.gmail.com", port, username: CONFIG.username, password: "x" });
      expect(result.ok).toBe(false);
    }
    expect(resolveSmtpConfig({ host: "smtp.gmail.com:465", username: CONFIG.username, password: "x" }).ok).toBe(false);
    expect(resolveSmtpConfig({ host: "smtp.gmail.com", username: "support", password: "x" }).ok).toBe(false);
  });
});

describe("MIME message", () => {
  it("parses display-name and bare mailboxes", () => {
    expect(parseMailbox("Priority Property Pros <support@prioritypropertypros.com>")).toEqual({
      name: "Priority Property Pros",
      address: "support@prioritypropertypros.com",
    });
    expect(parseMailbox("homeowner@example.com")).toEqual({ name: "", address: "homeowner@example.com" });
    expect(parseMailbox("not an address")).toBeNull();
    expect(parseMailbox("a@b.com\r\nBcc: x@evil.com")).toBeNull();
  });

  it("keeps the notification text, HTML, footer and unsubscribe headers intact", () => {
    const email = sampleEmail();
    const message = buildMimeMessage({
      from: "Priority Property Pros <support@prioritypropertypros.com>",
      to: "homeowner@example.com",
      subject: email.subject,
      text: email.text,
      html: email.html,
      headers: {
        "List-Unsubscribe": "<https://example.supabase.co/functions/v1/notification-unsubscribe?token=abc>",
        "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
      },
      date: new Date("2026-10-11T18:00:00Z"),
      messageId: "<fixed@prioritypropertypros.com>",
    });
    const headers = headerBlock(message);
    expect(headers).toContain("From: Priority Property Pros <support@prioritypropertypros.com>");
    expect(headers).toContain("To: homeowner@example.com");
    expect(headers).toContain("Subject: A new estimate is ready");
    expect(headers).toContain("Date: Sun, 11 Oct 2026 18:00:00 +0000");
    expect(headers).toContain("Message-ID: <fixed@prioritypropertypros.com>");
    expect(headers).toContain("MIME-Version: 1.0");
    expect(headers).toContain("List-Unsubscribe: <https://example.supabase.co/functions/v1/notification-unsubscribe?token=abc>");
    expect(headers).toContain("List-Unsubscribe-Post: List-Unsubscribe=One-Click");
    const parts = mimeParts(message);
    expect(parts["text/plain"]).toBe(email.text);
    expect(parts["text/html"]).toBe(email.html);
    expect(parts["text/plain"]).toContain("support@prioritypropertypros.com");
    for (const line of message.split("\r\n")) expect(line.length).toBeLessThanOrEqual(998);
  });

  it("carries any footer line verbatim, including the mailing address from #122", () => {
    const address = "Priority Property Pros LLC, 5900 Balcones Drive STE 100, Austin, TX 78731 US";
    const email = sampleEmail();
    const text = `${email.text}\n${address}`;
    const html = email.html.replace("</body>", `<p>${address}</p></body>`);
    const parts = mimeParts(
      buildMimeMessage({ from: "support@prioritypropertypros.com", to: "a@example.com", subject: "s", text, html }),
    );
    expect(parts["text/plain"].trim().endsWith(address)).toBe(true);
    expect(parts["text/html"]).toContain(address);
  });

  it("encodes UTF-8 subjects and names, and strips header injection", () => {
    expect(encodeHeaderText("Plain subject")).toBe("Plain subject");
    const encoded = encodeHeaderText("Estimate ready — José’s deck");
    expect(encoded).toMatch(/^=\?UTF-8\?B\?/);
    const decoded = encoded
      .split("\r\n ")
      .map((word) => decodeBase64Utf8(word.replace(/^=\?UTF-8\?B\?/, "").replace(/\?=$/, "")))
      .join("");
    expect(decoded).toBe("Estimate ready — José’s deck");
    const message = buildMimeMessage({
      from: "support@prioritypropertypros.com",
      to: "a@example.com",
      subject: "Hello\r\nBcc: victim@example.com",
      text: "t",
      html: "h",
      headers: { "X-Test": "ok\r\nBcc: victim@example.com", "Bcc": "victim@example.com", "Bad Name": "x" },
    });
    const headers = headerBlock(message);
    expect(headers).not.toMatch(/^Bcc:/m);
    expect(headers).toContain("Subject: Hello Bcc: victim@example.com");
    expect(headers).toContain("X-Test: ok Bcc: victim@example.com");
  });

  it("dot-stuffs lines that start with a period", () => {
    expect(dotStuff("a\r\n.b\n..c\r\n.")).toBe("a\r\n..b\r\n...c\r\n..");
  });
});

describe("SMTP session (mock server)", () => {
  const mail = () => {
    const email = sampleEmail();
    return {
      from: "Priority Property Pros <support@prioritypropertypros.com>",
      to: "homeowner@example.com",
      subject: email.subject,
      text: `${email.text}\n.line starting with a dot`,
      html: email.html,
      headers: { "List-Unsubscribe": "<https://example.test/u>", "List-Unsubscribe-Post": "List-Unsubscribe=One-Click" },
    };
  };

  it("connects on 465, authenticates with AUTH PLAIN, and delivers the message", async () => {
    const server = new MockSmtpServer();
    const result = await sendSmtpMail({ config: CONFIG, mail: mail(), connect: server.connect });
    expect(result).toEqual({ code: 250 });
    expect(server.connectedTo).toEqual({ host: "smtp.gmail.com", port: 465 });
    const plain = btoa("\u0000support@prioritypropertypros.com\u0000abcdefghijklmnop");
    expect(server.commands).toEqual([
      "EHLO prioritypropertypros.com",
      `AUTH PLAIN ${plain}`,
      "MAIL FROM:<support@prioritypropertypros.com>",
      "RCPT TO:<homeowner@example.com>",
      "DATA",
      "QUIT",
    ]);
    expect(server.data).toContain("List-Unsubscribe: <https://example.test/u>");
    // The server un-stuffs leading dots; the decoded body must match exactly.
    const unstuffed = server.data.split("\r\n").map((line) => (line.startsWith("..") ? line.slice(1) : line)).join("\r\n");
    expect(mimeParts(unstuffed)["text/plain"]).toBe(mail().text);
    expect(server.closed).toBe(true);
  });

  it.each([
    ["greeting", { greeting: "554 go away" }, 554],
    ["auth", { auth: "535-5.7.8 Username and Password not accepted\n535 5.7.8 BadCredentials" }, 535],
    ["mail", { mail: "550 sender rejected" }, 550],
    ["rcpt", { rcpt: "550 5.1.1 no such user" }, 550],
    ["data", { data: "451 try later" }, 451],
    ["send", { send: "552 message too big" }, 552],
  ] as const)("throws SmtpError at %s and closes the socket", async (stage, overrides, code) => {
    const server = new MockSmtpServer(overrides);
    const error = await sendSmtpMail({ config: CONFIG, mail: mail(), connect: server.connect }).catch((err: unknown) => err);
    expect(error).toBeInstanceOf(SmtpError);
    expect((error as SmtpError).stage).toBe(stage);
    expect((error as SmtpError).code).toBe(code);
    expect((error as SmtpError).message).not.toContain(CONFIG.password);
    expect(server.closed).toBe(true);
  });

  it("refuses servers that do not offer AUTH PLAIN", async () => {
    const server = new MockSmtpServer({ ehlo: "250-smtp.example\n250 AUTH LOGIN" });
    await expect(sendSmtpMail({ config: CONFIG, mail: mail(), connect: server.connect })).rejects.toMatchObject({ stage: "auth" });
    expect(server.commands.some((line) => line.startsWith("AUTH"))).toBe(false);
  });

  it("still succeeds when QUIT gets a bad reply after the message is accepted", async () => {
    const server = new MockSmtpServer({ quit: "500 whatever" });
    await expect(sendSmtpMail({ config: CONFIG, mail: mail(), connect: server.connect })).resolves.toEqual({ code: 250 });
  });

  it("times out a silent server and closes the socket", async () => {
    const server = new MockSmtpServer({}, { silent: true });
    await expect(sendSmtpMail({ config: CONFIG, mail: mail(), connect: server.connect, timeoutMs: 50 })).rejects.toMatchObject({
      stage: "timeout",
    });
    expect(server.closed).toBe(true);
  });

  it("times out a connect that never completes (blocked port)", async () => {
    const connect = () => new Promise<SmtpConnection>(() => undefined);
    await expect(sendSmtpMail({ config: CONFIG, mail: mail(), connect, timeoutMs: 50 })).rejects.toMatchObject({ stage: "timeout" });
  });

  it("rejects an invalid recipient before connecting", async () => {
    const server = new MockSmtpServer();
    await expect(sendSmtpMail({ config: CONFIG, mail: { ...mail(), to: "bad" }, connect: server.connect })).rejects.toBeInstanceOf(SmtpError);
    expect(server.connectedTo).toBeNull();
  });
});

describe("send-notification wiring", () => {
  const fn = readRepo("supabase/functions/send-notification/index.ts");
  const secrets = readRepo("supabase/functions/_shared/notificationSecrets.ts");

  it("sends through SMTP over implicit TLS and no longer calls Resend", () => {
    expect(fn).toContain("Deno.connectTls");
    expect(fn).toContain("sendSmtpMail(");
    expect(fn).not.toMatch(/resend\.com|RESEND_API_KEY/i);
    expect(secrets).not.toMatch(/resend/i);
    for (const name of ["SMTP_HOST", "SMTP_PORT", "SMTP_USER", "SMTP_PASS", "NOTIFICATION_FROM"]) {
      expect(secrets).toContain(`"${name}"`);
    }
  });

  it("keeps skip-when-unconfigured, the dedupe log, and unsubscribe headers", () => {
    expect(fn).toMatch(/if \(!smtp\.ok\) \{\s*console\.warn\(`email skipped: \$\{smtp\.reason\}`\);\s*return "skipped";/);
    const skip = fn.indexOf("if (!smtp.ok)");
    const claim = fn.indexOf("await insertEmailLog(");
    const send = fn.indexOf("await sendSmtpMail(");
    expect(skip).toBeGreaterThan(-1);
    expect(skip).toBeLessThan(claim);
    expect(claim).toBeLessThan(send);
    expect(fn).toContain('if (inserted === 409)');
    expect(fn).toMatch(/catch \(error\) \{\s*\/\/ Release the dedupe claim[^\n]*\n\s*await deleteEmailLog\(input\.notification\.id\);/);
    expect(fn).toContain('"List-Unsubscribe": `<${unsubscribeUrl}>`');
    expect(fn).toContain('"List-Unsubscribe-Post": "List-Unsubscribe=One-Click"');
  });
});
