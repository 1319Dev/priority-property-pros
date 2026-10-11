import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const migration = readFileSync(
  path.join(root, "supabase/migrations/20261015120000_contact_messages.sql"),
  "utf8",
);
const rollback = readFileSync(
  path.join(root, "supabase/rollbacks/20261015120000_contact_messages_rollback.sql"),
  "utf8",
);

function functionBody(name: string): string {
  const start = migration.indexOf(`FUNCTION public.${name}`);
  expect(start).toBeGreaterThan(-1);
  const next = migration.indexOf("CREATE OR REPLACE FUNCTION", start + 20);
  return migration.slice(start, next === -1 ? undefined : next);
}

describe("contact message RLS", () => {
  it("lets only admins read messages and blocks client writes", () => {
    expect(migration).toContain("CREATE TABLE public.contact_messages");
    expect(migration).toContain("ALTER TABLE public.contact_messages ENABLE ROW LEVEL SECURITY");
    expect(migration).toContain("REVOKE ALL ON TABLE public.contact_messages FROM PUBLIC, anon, authenticated");
    expect(migration).toContain("GRANT SELECT ON TABLE public.contact_messages TO authenticated");
    expect(migration).toContain("USING (public.is_admin())");
    expect(migration).not.toMatch(/CREATE POLICY contact_messages_\w+\s+ON public\.contact_messages\s+FOR INSERT/);
    expect(migration).not.toMatch(/CREATE POLICY contact_messages_\w+\s+ON public\.contact_messages\s+FOR UPDATE/);
    expect(migration).not.toMatch(/CREATE POLICY contact_messages_\w+\s+ON public\.contact_messages\s+FOR DELETE/);
    expect(migration).not.toMatch(/GRANT INSERT ON TABLE public\.contact_messages TO anon/);
    expect(migration).not.toMatch(/GRANT INSERT ON TABLE public\.contact_messages TO authenticated/);
    expect(migration).not.toMatch(/GRANT UPDATE ON TABLE public\.contact_messages TO authenticated/);
    expect(migration).not.toMatch(/GRANT SELECT ON TABLE public\.contact_messages TO anon/);
    expect(migration).toContain("delete rows older than 24 months");
    expect(migration).toContain("handled_at timestamptz");
  });

  it("keeps rate buckets as hashes with no anon or authenticated access", () => {
    expect(migration).toContain("CREATE TABLE public.contact_rate_buckets");
    expect(migration).toContain("ALTER TABLE public.contact_rate_buckets ENABLE ROW LEVEL SECURITY");
    expect(migration).toContain("REVOKE ALL ON TABLE public.contact_rate_buckets FROM PUBLIC, anon, authenticated");
    expect(migration).toContain("Salted hash of the caller IP");
    expect(migration).toContain("Delete windows older than 7 days");
    expect(migration).not.toMatch(/GRANT SELECT ON TABLE public\.contact_rate_buckets TO anon/);
    expect(migration).not.toMatch(/GRANT SELECT ON TABLE public\.contact_rate_buckets TO authenticated/);
    const rate = functionBody("consume_contact_rate_bucket");
    expect(rate).toContain("REVOKE ALL ON FUNCTION public.consume_contact_rate_bucket(text, integer, integer) FROM PUBLIC, anon, authenticated");
    expect(rate).toContain("GRANT EXECUTE ON FUNCTION public.consume_contact_rate_bucket(text, integer, integer) TO service_role");
    expect(rate).not.toContain("GRANT EXECUTE ON FUNCTION public.consume_contact_rate_bucket(text, integer, integer) TO anon");
    expect(rate).not.toContain("GRANT EXECUTE ON FUNCTION public.consume_contact_rate_bucket(text, integer, integer) TO authenticated");
  });

  it("gates mark-handled and the unhandled count on is_admin and audits the mark", () => {
    const mark = functionBody("admin_mark_contact_message_handled");
    expect(mark).toContain("IF NOT public.is_admin()");
    expect(mark).toContain("ERRCODE = '42501'");
    expect(mark).toContain("contact_message.handled");
    expect(mark).toContain("jsonb_build_object('handled', true)");
    expect(mark).not.toContain("'message'");
    expect(mark).toContain("REVOKE ALL ON FUNCTION public.admin_mark_contact_message_handled(uuid) FROM PUBLIC, anon");
    expect(mark).toContain("GRANT EXECUTE ON FUNCTION public.admin_mark_contact_message_handled(uuid) TO authenticated");
    expect(mark).not.toContain("GRANT EXECUTE ON FUNCTION public.admin_mark_contact_message_handled(uuid) TO anon");

    const count = functionBody("admin_unhandled_contact_message_count");
    expect(count).toContain("IF NOT public.is_admin()");
    expect(count).toContain("WHERE handled_at IS NULL");
    expect(count).toContain("REVOKE ALL ON FUNCTION public.admin_unhandled_contact_message_count() FROM PUBLIC, anon");
    expect(count).toContain("GRANT EXECUTE ON FUNCTION public.admin_unhandled_contact_message_count() TO authenticated");
    expect(migration).not.toMatch(/FUNCTION public\.admin_dashboard_/);
    expect(migration).not.toMatch(/FUNCTION public\.admin_needs_attention/);
  });

  it("rolls the tables and functions back without touching the dashboard RPCs", () => {
    expect(rollback).toContain("DROP FUNCTION IF EXISTS public.admin_mark_contact_message_handled(uuid)");
    expect(rollback).toContain("DROP FUNCTION IF EXISTS public.admin_unhandled_contact_message_count()");
    expect(rollback).toContain("DROP FUNCTION IF EXISTS public.consume_contact_rate_bucket(text, integer, integer)");
    expect(rollback).toContain("DROP TABLE IF EXISTS public.contact_rate_buckets");
    expect(rollback).toContain("DROP TABLE IF EXISTS public.contact_messages");
    expect(rollback).not.toMatch(/admin_dashboard_/);
  });
});
