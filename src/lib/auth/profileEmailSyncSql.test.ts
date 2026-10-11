import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const migration = readFileSync(
  path.join(root, "supabase/migrations/20261017000001_sync_profile_email_from_auth.sql"),
  "utf8",
);
const rollback = readFileSync(
  path.join(root, "supabase/rollbacks/20261017000001_sync_profile_email_from_auth_rollback.sql"),
  "utf8",
);

describe("profile email sync migration", () => {
  it("copies auth email through a local GUC and still blocks role and fee writes", () => {
    expect(migration).toMatch(/AFTER UPDATE OF email ON auth\.users/);
    expect(migration).toMatch(/ppp\.profile_email_sync/);
    expect(migration).toMatch(/NEW\.email IS DISTINCT FROM \(\s*SELECT u\.email FROM auth\.users/);
    expect(migration).toMatch(/email cannot be changed from the client/);
    expect(migration).toMatch(/ADMIN cannot be assigned from the client/);
    expect(migration).toMatch(/account_type cannot be changed by the account owner/);
    expect(migration).toMatch(/account_status cannot be changed by the account owner/);
    expect(migration).toMatch(/signup fee fields cannot be changed from the client/);
    expect(migration).toMatch(/REVOKE ALL ON FUNCTION public\.sync_profile_email_from_auth\(\) FROM PUBLIC, anon, authenticated/);
    expect(migration).toMatch(/GRANT EXECUTE ON FUNCTION public\.sync_profile_email_from_auth\(\) TO supabase_auth_admin/);
    expect(migration).toMatch(/profile\.email_synced/);
    expect(migration).not.toMatch(/signup_fee_status\s*=/);
  });

  it("rollback drops the trigger and restores the client email block", () => {
    expect(rollback).toMatch(/DROP TRIGGER IF EXISTS on_auth_user_email_updated/);
    expect(rollback).toMatch(/DROP FUNCTION IF EXISTS public\.sync_profile_email_from_auth/);
    expect(rollback).toMatch(/email cannot be changed from the client/);
    expect(rollback).not.toMatch(/ppp\.profile_email_sync/);
  });
});
