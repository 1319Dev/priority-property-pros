import { describe, expect, it } from "vitest";
import {
  MESSAGE_EMAIL_THROTTLE_MS,
  MINIMAL_MESSAGE_EMAIL,
  NOTIFICATION_CATEGORIES,
  buildNotificationEmail,
  categoryForKind,
  channelEnabled,
  defaultPreference,
  isSafeAppPath,
  messageEmailDecision,
  notificationPath,
  resolveSecret,
  resolveUnsubscribeSecret,
  signUnsubscribeToken,
  verifyUnsubscribeToken,
  winningEmailClaim,
} from "./policy";

const NOW = Date.parse("2026-10-08T15:00:00.000Z");

describe("notification preference defaults", () => {
  it("turns in-app on, push off, and email on for the active categories", () => {
    for (const category of NOTIFICATION_CATEGORIES) {
      const pref = defaultPreference(category);
      expect(pref.in_app).toBe(true);
      expect(pref.push).toBe(false);
    }
    expect(defaultPreference("new_job").email).toBe(true);
    expect(defaultPreference("messages").email).toBe(true);
    expect(defaultPreference("connect").email).toBe(true);
    expect(defaultPreference("estimates").email).toBe(true);
    expect(defaultPreference("booking").email).toBe(true);
    expect(defaultPreference("change_orders").email).toBe(true);
    expect(defaultPreference("reviews").email).toBe(false);
    expect(defaultPreference("account").email).toBe(false);
  });

  it("lets a saved row override a default", () => {
    expect(channelEnabled("messages", { in_app: false, push: true, email: false }, "email")).toBe(false);
    expect(channelEnabled("messages", { in_app: false, push: true, email: false }, "push")).toBe(true);
    expect(channelEnabled("reviews", null, "email")).toBe(false);
    expect(channelEnabled("reviews", null, "in_app")).toBe(true);
  });

  it("maps alert kinds onto the eight categories", () => {
    expect(categoryForKind("opportunity.offered")).toBe("new_job");
    expect(categoryForKind("message.received")).toBe("messages");
    expect(categoryForKind("question.asked")).toBe("messages");
    expect(categoryForKind("connect.paid")).toBe("connect");
    expect(categoryForKind("contact.shared")).toBe("connect");
    expect(categoryForKind("estimate.received")).toBe("estimates");
    expect(categoryForKind("booking.confirmed")).toBe("booking");
    expect(categoryForKind("change_order.declined")).toBe("change_orders");
    expect(categoryForKind("review.received")).toBe("reviews");
    expect(categoryForKind("account.notice")).toBe("account");
  });
});

describe("message email throttling", () => {
  it("sends the first unread message and blocks a second one inside 15 minutes", () => {
    expect(messageEmailDecision({ readAt: null, lastSentAt: null, nowMs: NOW }).send).toBe(true);
    const recent = new Date(NOW - 10 * 60 * 1000).toISOString();
    expect(messageEmailDecision({ readAt: null, lastSentAt: recent, nowMs: NOW })).toEqual({
      send: false,
      reason: "throttled",
    });
  });

  it("sends again after 15 minutes and never emails a read alert", () => {
    const expired = new Date(NOW - MESSAGE_EMAIL_THROTTLE_MS).toISOString();
    expect(messageEmailDecision({ readAt: null, lastSentAt: expired, nowMs: NOW }).reason).toBe("ok");
    expect(messageEmailDecision({ readAt: new Date(NOW).toISOString(), lastSentAt: null, nowMs: NOW })).toEqual({
      send: false,
      reason: "already_read",
    });
  });

  it("keeps one winner when two sends race inside the same window", () => {
    const claims = [
      { notificationId: "b", sentAt: "2026-10-08T15:00:02.000Z" },
      { notificationId: "a", sentAt: "2026-10-08T15:00:01.000Z" },
    ];
    expect(winningEmailClaim(claims, "a")).toBe(true);
    expect(winningEmailClaim(claims, "b")).toBe(false);
    expect(
      winningEmailClaim(
        [
          { notificationId: "b", sentAt: "2026-10-08T15:00:01.000Z" },
          { notificationId: "a", sentAt: "2026-10-08T15:00:01.000Z" },
        ],
        "a",
      ),
    ).toBe(true);
    expect(winningEmailClaim([], "a")).toBe(false);
  });
});

describe("secret resolution", () => {
  it("prefers Vault and falls back to the environment", () => {
    expect(resolveSecret({ vaultValue: "from-vault", envValue: "from-env" })).toBe("from-vault");
    expect(resolveSecret({ vaultValue: "  ", envValue: "from-env" })).toBe("from-env");
    expect(resolveSecret({ vaultValue: null, envValue: "" })).toBe("");
  });

  it("keeps the Resend key in the environment unless only Vault has it", () => {
    expect(resolveSecret({ vaultValue: "vault-key", envValue: "env-key", preferEnv: true })).toBe("env-key");
    expect(resolveSecret({ vaultValue: "vault-key", envValue: " ", preferEnv: true })).toBe("vault-key");
  });

  it("signs unsubscribe links with the dedicated secret, then the webhook secret", () => {
    expect(
      resolveUnsubscribeSecret({
        vaultUnsubscribe: "unsub",
        envUnsubscribe: "env-unsub",
        vaultWebhook: "hook",
        envWebhook: "env-hook",
      }),
    ).toBe("unsub");
    expect(
      resolveUnsubscribeSecret({
        vaultUnsubscribe: "",
        envUnsubscribe: "env-unsub",
        vaultWebhook: "hook",
        envWebhook: "env-hook",
      }),
    ).toBe("env-unsub");
    expect(
      resolveUnsubscribeSecret({
        vaultWebhook: "hook",
        envWebhook: "env-hook",
      }),
    ).toBe("hook");
    expect(resolveUnsubscribeSecret({ envWebhook: "env-hook" })).toBe("env-hook");
  });
});

describe("notification email copy", () => {
  it("uses the minimal message sentence and leaves private text out", () => {
    const email = buildNotificationEmail({
      kind: "message.received",
      title: "New message from Sam",
      body: "Call 555-0100 and the gate code is 4455. 12 Oak Street.",
      itemUrl: "https://prioritypropertypros.com/app/pro/messages/project-1/pro-1",
      manageUrl: "https://prioritypropertypros.com/notifications",
      unsubscribeUrl: "https://example.supabase.co/functions/v1/notification-unsubscribe?token=abc",
    });
    expect(email.subject).toBe(MINIMAL_MESSAGE_EMAIL);
    expect(email.text).toContain(MINIMAL_MESSAGE_EMAIL);
    expect(email.text).toContain("https://prioritypropertypros.com/app/pro/messages/project-1/pro-1");
    expect(email.text).toContain("token=abc");
    expect(email.html).not.toContain("555-0100");
    expect(email.html).not.toContain("gate code");
    expect(email.html).not.toContain("Oak Street");
    expect(email.text).not.toContain("555-0100");
    expect(email.html).toContain("prioritypropertypros@gmail.com");
  });

  it("rejects external paths and keeps role-specific links", () => {
    expect(isSafeAppPath("/app/customer/projects/abc")).toBe(true);
    expect(isSafeAppPath("https://evil.example")).toBe(false);
    expect(isSafeAppPath("//evil.example")).toBe(false);
    expect(isSafeAppPath("/app/../admin")).toBe(false);
    expect(
      notificationPath({
        kind: "message.received",
        entityId: "thread-1",
        payload: { project_id: "project-1", contractor_profile_id: "pro-1", path: "https://evil.example" },
        accountType: "CONTRACTOR",
      }),
    ).toBe("/app/pro/messages/project-1/pro-1");
    expect(
      notificationPath({
        kind: "estimate.received",
        entityId: "est-1",
        payload: { project_id: "project-1" },
        accountType: "CUSTOMER",
      }),
    ).toBe("/app/customer/projects/project-1/estimates/est-1");
  });
});

describe("unsubscribe tokens", () => {
  it("round-trips a category and rejects tampering or expiry", async () => {
    const token = await signUnsubscribeToken({
      userId: "11111111-1111-4111-8111-111111111111",
      category: "messages",
      secret: "test-secret",
      nowSeconds: 1_700_000_000,
      ttlSeconds: 60,
    });
    await expect(verifyUnsubscribeToken(token, "test-secret", 1_700_000_030)).resolves.toEqual({
      ok: true,
      userId: "11111111-1111-4111-8111-111111111111",
      category: "messages",
    });
    await expect(verifyUnsubscribeToken(token, "other-secret", 1_700_000_030)).resolves.toEqual({
      ok: false,
      reason: "invalid",
    });
    await expect(verifyUnsubscribeToken(`${token}x`, "test-secret", 1_700_000_030)).resolves.toEqual({
      ok: false,
      reason: "invalid",
    });
    await expect(verifyUnsubscribeToken(token, "test-secret", 1_700_000_061)).resolves.toEqual({
      ok: false,
      reason: "expired",
    });
  });
});
