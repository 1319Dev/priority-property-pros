import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const read = (rel: string) => readFileSync(path.join(repoRoot, rel), "utf8");

const scrubName = "20261017100002_account_deletion_scrub_notifications.sql";
const scrub = read(`supabase/migrations/${scrubName}`);
const scrubRollback = read("supabase/rollbacks/20261017100002_account_deletion_scrub_notifications_rollback.sql");
const gap = read("supabase/migrations/20261017100001_account_deletion_clear_contractor_details.sql");
const sqlTest = read("supabase/tests/account_deletion_scrub_notifications.sql");

function purgeBody(sql: string): string {
  const start = sql.lastIndexOf("CREATE OR REPLACE FUNCTION public.purge_account_owned_rows");
  expect(start).toBeGreaterThan(-1);
  const end = sql.indexOf("$function$;", start);
  expect(end).toBeGreaterThan(start);
  return sql.slice(start, end);
}

describe("account deletion notification scrub SQL", () => {
  const purge = purgeBody(scrub);

  it("uses a free version right after the contractor-details migration", () => {
    const names = readdirSync(path.join(repoRoot, "supabase/migrations")).filter((n) => n.endsWith(".sql")).sort();
    expect(names.filter((n) => n.startsWith("20261017100002"))).toEqual([scrubName]);
    expect(names.indexOf(scrubName)).toBe(
      names.indexOf("20261017100001_account_deletion_clear_contractor_details.sql") + 1,
    );
  });

  it("rewrites message notifications to neutral text inside the purge, before names are cleared", () => {
    expect(purge).toMatch(/'a former PPP pro'/);
    expect(purge).toMatch(/'a deleted user'/);
    expect(purge).toMatch(/SET body = 'New message from ' \|\| v_neutral \|\| '\.'/);
    expect(purge).toMatch(/n\.kind = 'message\.received'/);
    expect(purge).toMatch(/n\.entity_type = 'project_message_threads'/);
    const scrubAt = purge.indexOf("UPDATE public.notifications");
    const namesCleared = purge.indexOf("first_name = ''");
    const businessCleared = purge.indexOf("business_name = 'Deleted Pro'");
    const authDelete = purge.indexOf("DELETE FROM auth.users WHERE id = p_user_id");
    expect(scrubAt).toBeGreaterThan(purge.indexOf("Finish or cancel your active jobs before deleting this account"));
    expect(scrubAt).toBeLessThan(namesCleared);
    expect(scrubAt).toBeLessThan(businessCleared);
    expect(scrubAt).toBeLessThan(authDelete);
    expect(purge).toMatch(/'notifications_scrubbed', v_notifications_scrubbed/);
  });

  it("never touches the account's own rows, never deletes notifications, and scopes first names", () => {
    expect(purge.match(/n\.recipient_profile_id IS DISTINCT FROM p_user_id/g)?.length).toBe(3);
    expect(purge).not.toMatch(/DELETE FROM public\.notifications/);
    // Global pass only uses full name, email, and phone.
    const globalTerms = purge.slice(purge.indexOf("array_remove(ARRAY[", purge.indexOf("array_remove(ARRAY[") + 1));
    expect(globalTerms.slice(0, globalTerms.indexOf("], NULL)"))).not.toMatch(/business_name|public_directory_label/);
    expect(purge).toMatch(/public\.public_directory_label\(v_contractor_id\)/);
    expect(purge).toMatch(/n\.payload ->> 'project_id' = ANY \(v_related_ids\)/);
    expect(purge).toMatch(/n\.payload ->> 'contractor_profile_id' = v_contractor_id::text/);
  });

  it("keeps every refusal and money rule from 20261017100001", () => {
    for (const text of [
      "Finish or cancel your active jobs before deleting this account.",
      "Resolve the open dispute before deleting this account.",
      "Wait until the outstanding refund is finished before deleting this account.",
      "cannot delete the last active admin",
      "DELETE FROM public.contractor_stripe_accounts",
      "DELETE FROM public.project_photos",
    ]) {
      expect(purge).toContain(text);
    }
    expect(purge).not.toMatch(/DELETE FROM public\.(payments|refunds|ledger_entries|stripe_disputes|signup_fee_charges|connection_checkout_sessions)/);
    expect(purge).not.toMatch(/fee_cents\s*=/);
    expect(scrub).not.toMatch(/stripe\.com|net\.http_post/);
    // The only change from 20261017100001 is the scrub block, its declarations, and the result field.
    const strip = (body: string) =>
      body
        .replace(/\n {2}-- Notification scrub\. Other people's[\s\S]*?PERFORM public\.ppp_set_rpc\('purge_account_owned_rows'\);\n\n/, "\n")
        .replace(/ {2}-- Notification scrub \(20261017100002\)\.\n(?: {2}v_[^\n]*\n)+/, "")
        .replace(",\n    'notifications_scrubbed', v_notifications_scrubbed", "");
    expect(strip(purge)).toBe(purgeBody(gap));
  });

  it("escapes terms literally and keeps the helpers away from clients", () => {
    expect(scrub).toMatch(/regexp_replace\(v_term, '\(\[\^\[:alnum:\]\[:space:\]\]\)', '\\\\\\1', 'g'\)/);
    expect(scrub).toMatch(/ORDER BY length\(t\) DESC/);
    expect(scrub).toMatch(/'gi'/);
    expect(scrub).toMatch(/REVOKE ALL ON FUNCTION public\.scrub_deleted_identity_text\(text, text\[\], text\) FROM PUBLIC, anon, authenticated;/);
    expect(scrub).toMatch(/REVOKE ALL ON FUNCTION public\.scrub_deleted_identity_jsonb\(jsonb, text\[\], text, boolean\) FROM PUBLIC, anon, authenticated;/);
    expect(scrub).toMatch(/notifications_dispatch_channels is AFTER INSERT/);
    for (const key of ["'first_name'", "'business_name'", "'email'", "'phone'", "'customer_name'"]) {
      expect(scrub).toContain(key);
    }
  });

  it("rolls back to the 20261017100001 purge exactly and drops the helpers", () => {
    expect(purgeBody(scrubRollback)).toBe(purgeBody(gap));
    expect(scrubRollback).toMatch(/DROP FUNCTION IF EXISTS public\.scrub_deleted_identity_jsonb\(jsonb, text\[\], text, boolean\);/);
    expect(scrubRollback).toMatch(/DROP FUNCTION IF EXISTS public\.scrub_deleted_identity_text\(text, text\[\], text\);/);
    expect(scrubRollback).not.toMatch(/UPDATE public\.notifications/);
  });

  it("has SQL tests for neutral text, unrelated rows, refusals, and rollback", () => {
    expect(sqlTest).toMatch(/BEGIN;[\s\S]*ROLLBACK;/);
    expect(sqlTest).toMatch(/'New message from a deleted user\.'/);
    expect(sqlTest).toMatch(/'New message from a former PPP pro\.'/);
    expect(sqlTest).toMatch(/U1, UP1, U2 unchanged/);
    expect(sqlTest).toMatch(/Refused delete \(active job\): every notification unchanged/);
    expect(sqlTest).toMatch(/Forced failure at the profile delete/);
  });
});
