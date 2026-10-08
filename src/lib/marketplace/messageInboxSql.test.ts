import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const migrationName = "20261011000004_message_inbox_reads.sql";

function sql(): string {
  return readFileSync(path.join(repoRoot, "supabase/migrations", migrationName), "utf8");
}

describe("message inbox read state", () => {
  const text = sql();

  it("stores last_read_at per participant and locks RLS to that profile", () => {
    expect(text).toMatch(/CREATE TABLE public\.project_message_reads/);
    expect(text).toMatch(/PRIMARY KEY \(thread_id, profile_id\)/);
    expect(text).toMatch(/last_read_at timestamptz NOT NULL/);
    expect(text).toMatch(/ALTER TABLE public\.project_message_reads ENABLE ROW LEVEL SECURITY/);
    expect(text).toMatch(/CREATE POLICY project_message_reads_select_own/);
    expect(text).toMatch(/CREATE POLICY project_message_reads_insert_own/);
    expect(text).toMatch(/CREATE POLICY project_message_reads_update_own/);
    expect(text).toMatch(/USING \(profile_id = \(SELECT auth\.uid\(\)\)\)/);
    expect(text).toMatch(/WITH CHECK \(\s*profile_id = \(SELECT auth\.uid\(\)\)/);
    expect(text).toMatch(/GRANT SELECT, INSERT, UPDATE ON TABLE public\.project_message_reads TO authenticated/);
    expect(text).not.toMatch(/GRANT DELETE ON TABLE public\.project_message_reads/);
    expect(text).not.toMatch(/TO anon/);
    expect(text).not.toMatch(/FOR DELETE/);
    expect(text).toMatch(/message_thread_participant\(thread_id\)/);
  });

  it("marks the open thread and related message notices read without touching fees", () => {
    expect(text).toMatch(/CREATE OR REPLACE FUNCTION public\.mark_message_thread_read/);
    expect(text).toMatch(/ON CONFLICT \(thread_id, profile_id\)/);
    expect(text).toMatch(/kind = 'message\.received'/);
    expect(text).toMatch(/not a thread participant/);
    expect(text).toMatch(/GRANT EXECUTE ON FUNCTION public\.mark_message_thread_read\(uuid\) TO authenticated/);
    expect(text).not.toMatch(/payments_live',\s*1/);
    expect(text).not.toMatch(/charges_live',\s*1/);
    expect(text).not.toMatch(/lock_booking_fee/);
    expect(text).not.toMatch(/signup_fee_enabled/);
  });

  it("sorts by the latest message and names the other party without contact fields", () => {
    expect(text).toMatch(/ORDER BY rows\.last_message_at DESC NULLS LAST/);
    expect(text).toMatch(/cp\.business_name/);
    expect(text).toMatch(/cust\.first_name/);
    expect(text).toMatch(/'other_party_label', rows\.other_party_label/);
    expect(text).toMatch(/'unread_count', rows\.unread_count/);
    expect(text).toMatch(/'last_sender_is_viewer', rows\.last_sender_is_viewer/);
    expect(text).toMatch(/New message from /);
    expect(text).not.toMatch(/'phone'/);
    expect(text).not.toMatch(/'email'/);
    expect(text).not.toMatch(/'street'/);
    expect(text).toMatch(/message_pair_has_connection_entitlement/);
  });
});
