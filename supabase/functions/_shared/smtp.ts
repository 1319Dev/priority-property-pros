/**
 * Minimal SMTP sender for notification email over implicit TLS (port 465).
 *
 * Google Workspace (smtp.gmail.com) accepts AUTH PLAIN with the full mailbox
 * address and a 16-character app password. Supabase Edge Functions block
 * outbound ports 25 and 587, so only port 465 (TLS from the first byte) is
 * supported; STARTTLS is intentionally not implemented.
 *
 * This file has no Deno or Node globals at import time so the protocol and
 * MIME logic can be unit tested with a mock connection. The Deno edge
 * function supplies the real TLS socket via `connect`.
 */

export const SMTP_IMPLICIT_TLS_PORT = 465;
export const SMTP_DEFAULT_TIMEOUT_MS = 15_000;

export type SmtpConfig = {
  host: string;
  port: number;
  username: string;
  password: string;
};

export type SmtpConfigResult =
  | { ok: true; config: SmtpConfig }
  | { ok: false; reason: string };

/** A byte stream, shaped like a subset of Deno.TlsConn. */
export type SmtpConnection = {
  read(buffer: Uint8Array): Promise<number | null>;
  write(data: Uint8Array): Promise<number>;
  close(): void;
};

export type SmtpConnect = (host: string, port: number) => Promise<SmtpConnection>;

export type MailAddress = { name: string; address: string };

export type OutgoingMail = {
  from: string;
  to: string;
  subject: string;
  text: string;
  html: string;
  headers?: Record<string, string>;
  date?: Date;
  messageId?: string;
  boundary?: string;
};

export class SmtpError extends Error {
  code: number;
  stage: string;
  constructor(stage: string, code: number, message: string) {
    super(message);
    this.name = "SmtpError";
    this.stage = stage;
    this.code = code;
  }
}

const ADDRESS = /^[^\s@<>()",;:\\[\]]+@[^\s@<>()",;:\\[\]]+\.[^\s@<>()",;:\\[\]]+$/;

/**
 * Reads SMTP_HOST / SMTP_PORT / SMTP_USER / SMTP_PASS values. Anything
 * missing or unsupported returns `ok: false` so the caller can skip email
 * (same behavior as the old "API key not set" path).
 */
export function resolveSmtpConfig(input: {
  host?: string | null;
  port?: string | null;
  username?: string | null;
  password?: string | null;
}): SmtpConfigResult {
  const host = (input.host ?? "").trim();
  const username = (input.username ?? "").trim();
  // App passwords are often copied with spaces ("abcd efgh ijkl mnop").
  const password = (input.password ?? "").replace(/\s+/g, "");
  const portText = (input.port ?? "").trim();
  if (!host || !username || !password) {
    return { ok: false, reason: "SMTP_HOST, SMTP_USER, or SMTP_PASS is not set" };
  }
  if (/[\s/:]/.test(host)) return { ok: false, reason: "SMTP_HOST must be a bare host name" };
  if (!ADDRESS.test(username)) return { ok: false, reason: "SMTP_USER must be a full email address" };
  const port = portText ? Number(portText) : SMTP_IMPLICIT_TLS_PORT;
  if (port !== SMTP_IMPLICIT_TLS_PORT) {
    return { ok: false, reason: "SMTP_PORT must be 465 (implicit TLS); edge functions block 25 and 587" };
  }
  return { ok: true, config: { host, port, username, password } };
}

function stripLineBreaks(value: string): string {
  return value.replace(/[\r\n]+/g, " ").trim();
}

/** Parses `Name <addr@example.com>` or a bare address. Returns null when invalid. */
export function parseMailbox(value: string): MailAddress | null {
  const raw = stripLineBreaks(value);
  const angle = /^(.*)<([^<>]+)>$/.exec(raw);
  const name = angle ? angle[1].trim().replace(/^"(.*)"$/, "$1").trim() : "";
  const address = (angle ? angle[2] : raw).trim();
  if (!ADDRESS.test(address)) return null;
  return { name, address };
}

const encoder = new TextEncoder();

function bytesToBase64(bytes: Uint8Array): string {
  let binary = "";
  for (let index = 0; index < bytes.length; index += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(index, index + 0x8000));
  }
  return btoa(binary);
}

export function base64Utf8(value: string): string {
  return bytesToBase64(encoder.encode(value));
}

function wrap76(value: string): string {
  const lines: string[] = [];
  for (let index = 0; index < value.length; index += 76) lines.push(value.slice(index, index + 76));
  return lines.join("\r\n");
}

// eslint-disable-next-line no-control-regex
const NON_ASCII = /[^\x20-\x7e]/;

/** RFC 2047 encoded-word for header text that is not plain printable ASCII. */
export function encodeHeaderText(value: string): string {
  const clean = stripLineBreaks(value);
  if (!NON_ASCII.test(clean)) return clean;
  const words: string[] = [];
  let chunk = "";
  for (const char of clean) {
    // Keep each encoded word comfortably under the 75-character limit.
    if (encoder.encode(chunk + char).length > 42) {
      words.push(`=?UTF-8?B?${base64Utf8(chunk)}?=`);
      chunk = "";
    }
    chunk += char;
  }
  if (chunk) words.push(`=?UTF-8?B?${base64Utf8(chunk)}?=`);
  return words.join("\r\n ");
}

export function formatMailbox(mailbox: MailAddress): string {
  if (!mailbox.name) return mailbox.address;
  const name = NON_ASCII.test(mailbox.name) || /[",<>@;:\\]/.test(mailbox.name)
    ? NON_ASCII.test(mailbox.name)
      ? encodeHeaderText(mailbox.name)
      : `"${mailbox.name.replace(/["\\]/g, "")}"`
    : mailbox.name;
  return `${name} <${mailbox.address}>`;
}

function randomToken(): string {
  const bytes = new Uint8Array(12);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

const HEADER_NAME = /^[A-Za-z0-9-]+$/;
const RESERVED_HEADERS = new Set([
  "from",
  "to",
  "subject",
  "date",
  "message-id",
  "mime-version",
  "content-type",
  "content-transfer-encoding",
  "bcc",
  "cc",
]);

/**
 * Builds an RFC 5322 multipart/alternative message (text + HTML), both parts
 * base64 encoded so long HTML lines and UTF-8 survive any relay. Custom
 * headers (List-Unsubscribe, ...) are copied with CR/LF stripped.
 */
export function buildMimeMessage(mail: OutgoingMail): string {
  const from = parseMailbox(mail.from);
  const to = parseMailbox(mail.to);
  if (!from) throw new SmtpError("build", 0, "invalid From address");
  if (!to) throw new SmtpError("build", 0, "invalid To address");
  const domain = from.address.split("@")[1];
  const boundary = mail.boundary ?? `ppp-${randomToken()}`;
  const messageId = mail.messageId ?? `<${randomToken()}.${Date.now()}@${domain}>`;
  const date = (mail.date ?? new Date()).toUTCString().replace("GMT", "+0000");

  const headers: string[] = [
    `From: ${formatMailbox(from)}`,
    `To: ${formatMailbox(to)}`,
    `Subject: ${encodeHeaderText(mail.subject)}`,
    `Date: ${date}`,
    `Message-ID: ${stripLineBreaks(messageId)}`,
    "MIME-Version: 1.0",
  ];
  for (const [name, value] of Object.entries(mail.headers ?? {})) {
    if (!HEADER_NAME.test(name) || RESERVED_HEADERS.has(name.toLowerCase())) continue;
    headers.push(`${name}: ${stripLineBreaks(value)}`);
  }
  headers.push(`Content-Type: multipart/alternative; boundary="${boundary}"`);

  const part = (type: string, body: string) =>
    [
      `--${boundary}`,
      `Content-Type: ${type}; charset=UTF-8`,
      "Content-Transfer-Encoding: base64",
      "",
      wrap76(base64Utf8(body)),
    ].join("\r\n");

  return [
    headers.join("\r\n"),
    "",
    part("text/plain", mail.text),
    part("text/html", mail.html),
    `--${boundary}--`,
    "",
  ].join("\r\n");
}

/** Escapes lines that begin with "." for the DATA phase (RFC 5321 4.5.2). */
export function dotStuff(message: string): string {
  return message
    .replace(/\r?\n/g, "\r\n")
    .split("\r\n")
    .map((line) => (line.startsWith(".") ? `.${line}` : line))
    .join("\r\n");
}

type SmtpReply = { code: number; lines: string[] };

class SmtpSession {
  private conn: SmtpConnection;
  private buffered = "";
  private decoder = new TextDecoder();

  constructor(conn: SmtpConnection) {
    this.conn = conn;
  }

  private async readLine(): Promise<string> {
    for (;;) {
      const newline = this.buffered.indexOf("\n");
      if (newline >= 0) {
        const line = this.buffered.slice(0, newline).replace(/\r$/, "");
        this.buffered = this.buffered.slice(newline + 1);
        return line;
      }
      const chunk = new Uint8Array(4096);
      const read = await this.conn.read(chunk);
      if (read === null) throw new SmtpError("read", 0, "connection closed by server");
      this.buffered += this.decoder.decode(chunk.subarray(0, read), { stream: true });
    }
  }

  async reply(): Promise<SmtpReply> {
    const lines: string[] = [];
    for (;;) {
      const line = await this.readLine();
      const match = /^(\d{3})([ -])(.*)$/.exec(line);
      if (!match) throw new SmtpError("read", 0, "malformed SMTP reply");
      lines.push(match[3]);
      if (match[2] === " ") return { code: Number(match[1]), lines };
    }
  }

  async write(data: string): Promise<void> {
    let bytes = encoder.encode(data);
    while (bytes.length > 0) {
      const written = await this.conn.write(bytes);
      bytes = bytes.subarray(written);
    }
  }

  async command(stage: string, line: string, expect: number[]): Promise<SmtpReply> {
    await this.write(`${line}\r\n`);
    return this.expect(stage, expect);
  }

  async expect(stage: string, expect: number[]): Promise<SmtpReply> {
    const result = await this.reply();
    if (!expect.includes(result.code)) {
      // Never echo credentials; server text is short and safe to log.
      throw new SmtpError(stage, result.code, `SMTP ${stage} failed with ${result.code}`);
    }
    return result;
  }
}

function withTimeout<T>(work: Promise<T>, ms: number, onTimeout: () => void): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      onTimeout();
      reject(new SmtpError("timeout", 0, `SMTP timed out after ${ms} ms`));
    }, ms);
  });
  return Promise.race([work, timeout]).finally(() => clearTimeout(timer));
}

/**
 * Sends one message: greeting, EHLO, AUTH PLAIN, MAIL FROM (the authenticated
 * mailbox), RCPT TO, DATA, QUIT. Throws SmtpError on any failure.
 */
export async function sendSmtpMail(input: {
  config: SmtpConfig;
  mail: OutgoingMail;
  connect: SmtpConnect;
  timeoutMs?: number;
}): Promise<{ code: number }> {
  const to = parseMailbox(input.mail.to);
  if (!to) throw new SmtpError("build", 0, "invalid To address");
  const message = buildMimeMessage(input.mail);
  const helo = input.config.username.split("@")[1];
  let conn: SmtpConnection | null = null;
  let closed = false;
  const close = () => {
    if (closed || !conn) return;
    closed = true;
    try {
      conn.close();
    } catch {
      // already closed
    }
  };
  let timedOut = false;
  const run = async () => {
    // The connect step counts toward the timeout too (a blocked port hangs).
    const opened = await input.connect(input.config.host, input.config.port);
    conn = opened;
    if (timedOut) {
      close();
      throw new SmtpError("timeout", 0, "SMTP connected after timeout");
    }
    const session = new SmtpSession(opened);
    await session.expect("greeting", [220]);
    const ehlo = await session.command("ehlo", `EHLO ${helo}`, [250]);
    const auth = ehlo.lines.find((line) => /^AUTH[ =]/i.test(line));
    if (auth && !/\bPLAIN\b/i.test(auth)) throw new SmtpError("auth", 0, "server does not offer AUTH PLAIN");
    const token = base64Utf8(`\u0000${input.config.username}\u0000${input.config.password}`);
    await session.command("auth", `AUTH PLAIN ${token}`, [235]);
    await session.command("mail", `MAIL FROM:<${input.config.username}>`, [250]);
    await session.command("rcpt", `RCPT TO:<${to.address}>`, [250, 251]);
    await session.command("data", "DATA", [354]);
    await session.write(`${dotStuff(message)}\r\n.\r\n`);
    const accepted = await session.expect("send", [250]);
    try {
      await session.command("quit", "QUIT", [221]);
    } catch {
      // Message is already accepted; a rude QUIT does not matter.
    }
    return { code: accepted.code };
  };
  try {
    return await withTimeout(run(), input.timeoutMs ?? SMTP_DEFAULT_TIMEOUT_MS, () => {
      timedOut = true;
      close();
    });
  } finally {
    close();
  }
}
