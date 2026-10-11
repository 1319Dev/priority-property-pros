import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const events = readFileSync(
  path.join(root, "supabase/migrations/20261019000003_admin_audit_events.sql"),
  "utf8",
);
const rollback = readFileSync(
  path.join(root, "supabase/rollbacks/20261019000003_admin_audit_events_rollback.sql"),
  "utf8",
);
const viewer = readFileSync(
  path.join(root, "supabase/migrations/20261019000004_admin_audit_log_rpc.sql"),
  "utf8",
);

const liveMd5: Record<string, string> = {
  propose_change_order: "431f15820bcfe659aaeb4f9d79ec55fc",
  respond_change_order: "89769a5817ebe8394c3f2569fd825cde",
  start_booking: "8434f9ed6c9cb0d9e79c67380a4453e2",
  complete_booking: "92c91b1cda778308836ac42a5e50ff56",
  submit_booking_review: "07fc55a5fa4def24c35c1cb7a573c1fc",
  block_contractor_for_customer: "e27b41b89f56658e44eb628f8c505757",
  unblock_contractor_for_customer: "06ac15f7e82d3d80a2763f53edfd06fc",
  apply_customer_low_rating_block: "1d733d2bf649696c24c365d441869bef",
};

function body(sql: string, name: string): string {
  const marker = `CREATE OR REPLACE FUNCTION public.${name}`;
  const start = sql.indexOf(marker);
  expect(start, name).toBeGreaterThan(-1);
  const rest = sql.slice(start);
  const match = /\n\$function\$;?\n/.exec(rest);
  expect(match, name).not.toBeNull();
  // pg_get_functiondef has no statement semicolon. The file needs one so psql
  // can run the next CREATE in the same script.
  return rest.slice(0, match!.index) + "\n$function$\n";
}

function withoutAudit(sql: string): string {
  return sql
    .replace(
      /ON CONFLICT \(customer_profile_id, contractor_profile_id\) DO NOTHING\n {2}RETURNING id INTO v_inserted;/g,
      "ON CONFLICT (customer_profile_id, contractor_profile_id) DO NOTHING;",
    )
    .replace(/\n {2}v_inserted uuid;/g, "")
    .replace(/\n {2}IF v_inserted IS NOT NULL THEN\n[\s\S]*?\n {2}END IF;\n/g, "\n")
    .replace(/\n {2}IF removed > 0 THEN\n[\s\S]*?\n {2}END IF;\n/g, "\n")
    .replace(/\n {2,4}PERFORM public\.write_audit_log\([\s\S]*?\n {2,4}\);\n/g, "\n");
}

describe("admin audit event SQL", () => {
  it("terminates every function so the script can load", () => {
    for (const sql of [events, rollback]) {
      expect(sql.split("\n").filter((line) => line === "$function$")).toEqual([]);
      expect(sql.split("\n").filter((line) => line === "$function$;")).toHaveLength(8);
    }
  });

  it("wraps the live definitions and only adds audit writes", () => {
    for (const [name, md5] of Object.entries(liveMd5)) {
      const previous = body(rollback, name);
      expect(createHash("md5").update(previous).digest("hex"), name).toBe(md5);
      const next = body(events, name);
      expect(withoutAudit(next), name).toBe(previous);
      const calls = next.match(/PERFORM public\.write_audit_log\([\s\S]*?\n {2,4}\);/g) ?? [];
      expect(calls.length, name).toBeGreaterThan(0);
      for (const call of calls) {
        expect(call, name).not.toMatch(/description|email|phone|address|business_name|storage_path|contractor_profile_id|payload|stripe/i);
      }
    }
  });

  it("keeps change-order money calls and does not retune fees", () => {
    const respond = body(events, "respond_change_order");
    expect(respond).toMatch(/PERFORM public\.recompute_booking_money\(b\.id\);/);
    expect(respond).toMatch(/PERFORM public\.add_change_order_schedule_item\(co\.id\);/);
    expect(events).not.toMatch(/UPDATE\s+public\.platform_settings/i);
    expect(events).not.toMatch(/payments_live',\s*1/);
    expect(events).not.toMatch(/charges_live',\s*1/);
    expect(body(events, "start_booking")).not.toMatch(/lock_booking_fee/);
    expect(body(events, "complete_booking")).not.toMatch(/lock_booking_fee/);
  });

  it("shows checkout events in an admin-only feed without contact fields", () => {
    expect(viewer).toContain(
      "v_action := left(replace(replace(replace(v_action, '\\', '\\\\'), '%', '\\%'), '_', '\\_'), 80);",
    );
    expect(viewer).toContain("f.action ILIKE v_action || '%' ESCAPE '\\'");
    expect(viewer).not.toContain("replace(v_action, '_', '')");
    expect(viewer).toMatch(/PERFORM public\.admin_require\(\)/);
    expect(viewer).toMatch(/connection\.checkout\./);
    expect(viewer).toMatch(/REVOKE ALL ON FUNCTION public\.admin_list_audit_log/);
    expect(viewer).toMatch(/GRANT EXECUTE ON FUNCTION public\.admin_list_audit_log\(text, text, date, date, text, integer\) TO authenticated/);
    expect(viewer).toMatch(/REVOKE ALL ON TABLE public\.audit_logs FROM PUBLIC, anon, authenticated/);
    expect(viewer).toMatch(/GRANT SELECT ON TABLE public\.audit_logs TO authenticated/);
    expect(viewer).toMatch(/audit_logs are immutable/);
    expect(viewer).not.toMatch(/e\.payload|stripe_checkout_session_id|business_name|storage_path|customer_email|\.email|\.phone|street/i);
    expect(viewer).not.toMatch(/UPDATE\s+public\.platform_settings/i);
  });
});
