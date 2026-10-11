import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  computeStripeSignatureHex,
  parseStripeSignatureHeader,
  stripeSignatureAgeOk,
  timingSafeEqual,
  verifyStripeSignature,
} from "../../../supabase/functions/_shared/webhook.ts";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const secret = "whsec_testsecret_1234";
const body = '{"id":"evt_test","type":"checkout.session.completed"}';
const nowMs = 1_700_000_000_000;
const timestamp = String(Math.floor(nowMs / 1000));

describe("Stripe webhook signatures", () => {
  it("accepts one valid v1 signature inside the 300 second window", async () => {
    const hex = await computeStripeSignatureHex(secret, timestamp, body);
    expect(await verifyStripeSignature(body, `t=${timestamp},v1=${hex}`, secret, nowMs)).toBe(true);
    expect(await verifyStripeSignature(body + "tampered", `t=${timestamp},v1=${hex}`, secret, nowMs)).toBe(false);
    expect(stripeSignatureAgeOk(timestamp, nowMs + 299_000)).toBe(true);
    expect(stripeSignatureAgeOk(timestamp, nowMs + 301_000)).toBe(false);
    expect(stripeSignatureAgeOk(timestamp, nowMs - 301_000)).toBe(false);
  });

  it("accepts any v1 during secret rotation and ignores v0", async () => {
    const hex = await computeStripeSignatureHex(secret, timestamp, body);
    const other = "ab".repeat(32);
    expect(await verifyStripeSignature(body, `t=${timestamp},v1=${other},v1=${hex}`, secret, nowMs)).toBe(true);
    expect(await verifyStripeSignature(body, `t=${timestamp},v1=${hex},v1=${other}`, secret, nowMs)).toBe(true);
    expect(await verifyStripeSignature(body, `t=${timestamp}, v1=${hex}`, secret, nowMs)).toBe(true);
    expect(await verifyStripeSignature(body, `t=${timestamp},v0=${hex}`, secret, nowMs)).toBe(false);
    expect(await verifyStripeSignature(body, `t=${timestamp},v0=${other},v1=${hex}`, secret, nowMs)).toBe(true);
    expect(await verifyStripeSignature(body, `t=${timestamp},v1=${other},v1=${other}`, secret, nowMs)).toBe(false);
    expect(parseStripeSignatureHeader(`t=${timestamp},v1=${other},v1=${hex}`)?.signatures).toEqual([other, hex]);
  });

  it("rejects a missing header, a bad secret, and a stale timestamp", async () => {
    const hex = await computeStripeSignatureHex(secret, timestamp, body);
    const stale = String(Number(timestamp) - 301);
    const staleHex = await computeStripeSignatureHex(secret, stale, body);
    expect(await verifyStripeSignature(body, "", secret, nowMs)).toBe(false);
    expect(await verifyStripeSignature(body, `t=${timestamp},v1=${hex}`, "not-a-webhook-secret", nowMs)).toBe(false);
    expect(await verifyStripeSignature(body, `t=${stale},v1=${staleHex}`, secret, nowMs)).toBe(false);
    expect(await verifyStripeSignature(body, `t=${timestamp},v1=short`, secret, nowMs)).toBe(false);
    expect(timingSafeEqual(hex, hex)).toBe(true);
    expect(timingSafeEqual(hex, "ab".repeat(32))).toBe(false);
    expect(timingSafeEqual("abc", "abcd")).toBe(false);
  });

  it("is the verifier both live webhooks import", () => {
    const source = readFileSync(path.join(root, "supabase/functions/_shared/webhook.ts"), "utf8");
    expect(source).not.toMatch(/if \(left\.length !== right\.length\) return false/);
    expect(source).toMatch(/key === "v1"/);
    expect(source).toMatch(/matched \|=/);
    for (const name of ["signup-fee-webhook", "connection-fee-webhook"]) {
      const fn = readFileSync(path.join(root, "supabase/functions", name, "index.ts"), "utf8");
      expect(fn).toMatch(/from "\.\.\/_shared\/webhook\.ts"/);
      expect(fn).toMatch(/verifyStripeSignature\(rawBody, header, webhookSecret\)/);
    }
  });
});
