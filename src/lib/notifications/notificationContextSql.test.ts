import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { ONCE_PER_ENTITY_KINDS, ONE_UNREAD_KINDS } from "./presentation";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const migrationName = "20261016000004_notification_context_dedupe.sql";
const rollbackName = "20261016000004_notification_context_dedupe_rollback.sql";

function read(kind: "migrations" | "rollbacks", name: string): string {
  return readFileSync(path.join(repoRoot, "supabase", kind, name), "utf8");
}

function executable(sql: string): string {
  return sql
    .split("\n")
    .filter((line) => !line.trim().startsWith("--"))
    .join("\n");
}

function functionBody(sql: string, name: string): string {
  const marker = `CREATE OR REPLACE FUNCTION public.${name}`;
  const start = sql.lastIndexOf(marker);
  expect(start).toBeGreaterThan(-1);
  const rest = sql.slice(start);
  const end = rest.indexOf("CREATE OR REPLACE FUNCTION public.", marker.length);
  return end === -1 ? rest : rest.slice(0, end);
}

describe("notification context migration", () => {
  const sql = read("migrations", migrationName);
  const code = executable(sql);
  const enqueue = functionBody(sql, "enqueue_notification");
  const list = functionBody(sql, "list_my_notifications");

  it("sorts after the previous notification and block migrations", () => {
    expect(migrationName > "20261015000003").toBe(true);
    expect(migrationName > "20261016000001_customer_contractor_blocks.sql").toBe(true);
  });

  it("dedupes the same kinds the client collapses and does not delete rows", () => {
    for (const kind of [...ONCE_PER_ENTITY_KINDS, ...ONE_UNREAD_KINDS]) {
      expect(enqueue).toContain(`'${kind}'`);
    }
    expect(enqueue).toMatch(/pg_advisory_xact_lock/);
    expect(enqueue).toMatch(/strip_private_contact_keys/);
    expect(code).not.toMatch(/DELETE\s+FROM\s+public\.notifications/i);
  });

  it("adds job context without contractor identity, addresses, or payment changes", () => {
    expect(list).toMatch(/message_pair_has_connection_entitlement/);
    expect(list).toMatch(/strip_private_contact_keys/);
    expect(list).toMatch(/text_contains_pre_hire_contact/);
    expect(list).toMatch(/contractor_can_read_project/);
    expect(list).toMatch(/'action_state'/);
    expect(list).toMatch(/'historical'/);
    expect(list).toMatch(/project_reference_number/);
    expect(list).toMatch(/- 'business_name'/);
    expect(list).not.toMatch(/contractor_profiles/);
    expect(list).not.toMatch(/FROM\s+public\.contractor_profiles/i);
    expect(code).not.toMatch(/stripe_/i);
    expect(code).not.toMatch(/DROP POLICY/i);
    expect(code).not.toMatch(/\bTO anon\b/);
    expect(code).toMatch(/GRANT EXECUTE ON FUNCTION public\.list_my_notifications\(\) TO authenticated/);
    expect(code).toMatch(/GRANT EXECUTE ON FUNCTION public\.mark_all_my_notifications_read\(\) TO authenticated/);
    expect(functionBody(sql, "ensure_notification_preferences")).toMatch(/v_type = 'CONTRACTOR'/);
  });
});

describe("notification context rollback", () => {
  const sql = read("rollbacks", rollbackName);

  it("drops the new helpers and restores the previous list", () => {
    expect(sql).toMatch(/DROP FUNCTION IF EXISTS public\.mark_all_my_notifications_read\(\)/);
    expect(sql).toMatch(/DROP FUNCTION IF EXISTS public\.notification_payload_uuid\(jsonb, text\)/);
    expect(sql).toMatch(/CREATE OR REPLACE FUNCTION public\.list_my_notifications\(\)/);
    expect(sql).toMatch(/CREATE OR REPLACE FUNCTION public\.enqueue_notification/);
    expect(sql).toMatch(/CREATE OR REPLACE FUNCTION public\.ensure_notification_preferences/);
    expect(sql).not.toMatch(/DELETE\s+FROM\s+public\.notifications/i);
    expect(executable(sql)).not.toMatch(/stripe_/i);
  });
});
