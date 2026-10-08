import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const migrationName = "20261013000001_notification_channels.sql";

function migrationSql(): string {
  return readFileSync(path.join(repoRoot, "supabase/migrations", migrationName), "utf8");
}

function functionBody(sql: string, name: string): string {
  const marker = `CREATE OR REPLACE FUNCTION public.${name}`;
  const start = sql.lastIndexOf(marker);
  expect(start).toBeGreaterThan(-1);
  const rest = sql.slice(start);
  const end = rest.indexOf("CREATE OR REPLACE FUNCTION public.", marker.length);
  return end === -1 ? rest : rest.slice(0, end);
}

describe("notification channel migration", () => {
  const sql = migrationSql();

  it("sorts after the current migrations and enables pg_net without storing a secret", () => {
    expect(migrationName > "20261008023700").toBe(true);
    expect(migrationName > "20261012000002").toBe(true);
    expect(sql).toMatch(/CREATE EXTENSION IF NOT EXISTS pg_net/);
    expect(sql).toMatch(/private\.notification_delivery_config/);
    expect(sql).toMatch(/REVOKE ALL ON TABLE private\.notification_delivery_config FROM anon, authenticated/);
    expect(sql).not.toMatch(/webhook_secret text NOT NULL DEFAULT/);
    expect(sql).not.toMatch(/sk_live_/);
    expect(sql).not.toMatch(/VAPID_PRIVATE_KEY\s*=\s*'/);
  });

  it("locks preferences and push subscriptions to the signed-in user", () => {
    expect(sql).toMatch(/CREATE TABLE IF NOT EXISTS public\.notification_preferences/);
    expect(sql).toMatch(/PRIMARY KEY \(user_id, category\)/);
    expect(sql).toMatch(/user_id = \(SELECT auth\.uid\(\)\)/);
    expect(sql).toMatch(/CREATE TABLE IF NOT EXISTS public\.push_subscriptions/);
    expect(sql).toMatch(/endpoint text NOT NULL/);
    expect(sql).toMatch(/p256dh text NOT NULL/);
    expect(sql).toMatch(/GRANT SELECT, DELETE ON TABLE public\.push_subscriptions TO authenticated/);
    expect(sql).not.toMatch(/GRANT INSERT ON TABLE public\.push_subscriptions/);
    expect(sql).toMatch(/ALTER TABLE public\.notification_email_log ENABLE ROW LEVEL SECURITY/);
    expect(sql).toMatch(/REVOKE ALL ON TABLE public\.notification_email_log FROM PUBLIC, anon, authenticated/);
  });

  it("notifies through enqueue and only reads connection status", () => {
    const connect = functionBody(sql, "notify_connection_active");
    expect(connect).toMatch(/notify_safely/);
    expect(connect).toMatch(/'connect\.paid'/);
    expect(connect).toMatch(/NEW\.status/);
    expect(connect).not.toMatch(/UPDATE public\.project_connections/);
    expect(connect).not.toMatch(/stripe_/);
    expect(sql).toMatch(/AFTER INSERT ON public\.notifications/);
    expect(sql).toMatch(/net\.http_post/);
    expect(sql).toMatch(/'x-notify-secret'/);
    expect(functionBody(sql, "dispatch_notification_channels")).toMatch(/RAISE WARNING/);
    expect(functionBody(sql, "notify_safely")).toMatch(/enqueue_notification/);
    expect(functionBody(sql, "notify_opportunity_offer")).toMatch(/'opportunity\.offered'/);
    expect(functionBody(sql, "notify_booking_status")).toMatch(/'booking\.hired'/);
    expect(functionBody(sql, "notify_change_order")).toMatch(/'change_order\.declined'/);
    expect(functionBody(sql, "notify_booking_review")).toMatch(/'review\.received'/);
    const questions = functionBody(sql, "notify_estimate_question");
    expect(questions).toMatch(/'A pro asked a question about your project\.'/);
    expect(questions).not.toMatch(/NEW\.prompt/);
    expect(questions).not.toMatch(/'answer_text'/);
    expect(questions).not.toMatch(/'prompt'/);
  });
});
