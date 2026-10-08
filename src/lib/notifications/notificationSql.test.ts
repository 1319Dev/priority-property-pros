import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const migrationName = "20261008114317_notification_channels.sql";
const cascadeName = "20261008115245_allow_notification_cascade_delete.sql";

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

  it("uses the production version and enables pg_net without storing a secret", () => {
    expect(migrationName > "20261008023700").toBe(true);
    expect(migrationName < "20261009000001").toBe(true);
    expect(sql).toMatch(/CREATE EXTENSION IF NOT EXISTS pg_net/);
    expect(sql).toMatch(/CREATE EXTENSION IF NOT EXISTS supabase_vault/);
    expect(sql).toMatch(/private\.notification_delivery_config/);
    expect(sql).toMatch(/REVOKE ALL ON TABLE private\.notification_delivery_config FROM anon, authenticated/);
    expect(sql).not.toMatch(/webhook_secret text NOT NULL DEFAULT/);
    expect(sql).not.toMatch(/sk_live_/);
    expect(sql).not.toMatch(/VAPID_PRIVATE_KEY\s*=\s*'/);
    const executable = sql
      .split("\n")
      .filter((line) => !line.trim().startsWith("--"))
      .join("\n");
    expect(executable).not.toMatch(/vault\.create_secret/);
    expect(executable).not.toMatch(/UPDATE\s+public\.project_connections/i);
    expect(executable).not.toMatch(/INSERT\s+INTO\s+public\.project_connections/i);
    expect(executable).not.toMatch(/UPDATE\s+public\.bookings/i);
    expect(executable).not.toMatch(/stripe_/i);
  });

  it("reads delivery settings from Vault and keeps them off the public API", () => {
    expect(sql).toMatch(/vault\.create_secret\('<NOTIFY_WEBHOOK_SECRET>', 'notify_webhook_secret'/);
    expect(sql).toMatch(/vault\.create_secret\('<VAPID_PRIVATE_KEY>', 'vapid_private_key'/);
    expect(sql).toMatch(/vault\.create_secret\('<NOTIFICATION_FUNCTION_URL>', 'notification_function_url'/);
    expect(sql).toMatch(/private\.get_notification_channel_secrets/);
    expect(sql).toMatch(/PERFORM public\.require_service_role\(\)/);
    expect(sql).toMatch(/REVOKE ALL ON FUNCTION private\.get_notification_channel_secrets\(\) FROM PUBLIC, anon, authenticated, service_role/);
    expect(sql).toMatch(/GRANT EXECUTE ON FUNCTION public\.get_notification_channel_secrets\(\) TO service_role/);
    const dispatch = functionBody(sql, "dispatch_notification_channels");
    expect(dispatch).toMatch(/vault\.decrypted_secrets/);
    expect(dispatch).toMatch(/notification_function_url/);
    expect(dispatch).toMatch(/notify_webhook_secret/);
    expect(dispatch).toMatch(/private\.notification_delivery_config/);
  });

  it("locks preferences and push subscriptions to the signed-in user", () => {
    expect(sql).toMatch(/CREATE TABLE IF NOT EXISTS public\.notification_preferences/);
    expect(sql).toMatch(/PRIMARY KEY \(user_id, category\)/);
    expect(sql).toMatch(/user_id = \(SELECT auth\.uid\(\)\)/);
    expect(sql).toMatch(/CREATE TABLE IF NOT EXISTS public\.push_subscriptions/);
    expect(sql).toMatch(/endpoint text NOT NULL/);
    expect(sql).toMatch(/p256dh text NOT NULL/);
    expect(sql).toMatch(/GRANT SELECT, DELETE ON TABLE public\.push_subscriptions TO authenticated/);
    expect(sql).toMatch(/CREATE POLICY push_subscriptions_select_own/);
    expect(sql).toMatch(/CREATE POLICY notification_preferences_update_own/);
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

describe("notification cascade delete", () => {
  it("is the last protect_notification_row definition so account deletion can cascade", () => {
    const dir = path.join(repoRoot, "supabase/migrations");
    const definers = readdirSync(dir)
      .filter((name) => name.endsWith(".sql"))
      .sort()
      .filter((name) =>
        readFileSync(path.join(dir, name), "utf8").includes(
          "CREATE OR REPLACE FUNCTION public.protect_notification_row",
        ),
      );
    expect(definers.at(-1)).toBe(cascadeName);
    expect(cascadeName > migrationName).toBe(true);
    const sql = readFileSync(path.join(dir, cascadeName), "utf8");
    expect(sql).toMatch(/pg_trigger_depth\(\) <= 1 AND NOT public\.is_admin\(\)/);
    expect(sql).toMatch(/RETURN OLD/);
  });
});
