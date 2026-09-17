import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { canClientPatchApprovalFields, canSelfApprove } from "../auth/rlsPolicy";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");

function allSql(): string {
  const dir = path.join(repoRoot, "supabase/migrations");
  return readdirSync(dir)
    .filter((name) => name.endsWith(".sql"))
    .sort()
    .map((name) => readFileSync(path.join(dir, name), "utf8"))
    .join("\n\n");
}

function srcFiles(): string {
  const walk = (dir: string, acc: string[] = []): string[] => {
    for (const name of readdirSync(dir, { withFileTypes: true })) {
      const next = path.join(dir, name.name);
      if (name.isDirectory()) walk(next, acc);
      else if (/\.(ts|tsx|js|mjs)$/.test(name.name) && !/\.test\.(ts|tsx)$/.test(name.name)) {
        acc.push(readFileSync(next, "utf8"));
      }
    }
    return acc;
  };
  return walk(path.join(repoRoot, "src")).join("\n");
}

describe("Admin contractor approvals SQL and client contract", () => {
  const sql = allSql();
  const frontend = srcFiles();

  it("adds admin-only SECURITY DEFINER RPCs with is_admin checks and authenticated grants", () => {
    expect(sql).toMatch(/FUNCTION public\.admin_approve_contractor\(p_contractor_profile_id uuid\)/);
    expect(sql).toMatch(/FUNCTION public\.admin_reject_contractor\(p_contractor_profile_id uuid, p_reason text/);
    expect(sql).toMatch(/FUNCTION public\.admin_request_contractor_info\(p_contractor_profile_id uuid, p_message text\)/);
    expect(sql).toMatch(/FUNCTION public\.list_contractor_approvals\(p_tab text/);
    expect(sql).toMatch(/FUNCTION public\.get_contractor_approval\(p_contractor_profile_id uuid\)/);
    expect(sql).toMatch(/FUNCTION public\.count_pending_contractor_approvals\(\)/);
    expect(sql).toMatch(/only an admin can approve a contractor/);
    expect(sql).toMatch(/only an admin can reject a contractor/);
    expect(sql).toMatch(/only an admin can request more information/);
    expect(sql).toMatch(/SECURITY DEFINER/);
    expect(sql).toMatch(/GRANT EXECUTE ON FUNCTION public\.admin_approve_contractor\(uuid\) TO authenticated/);
    expect(sql).toMatch(/GRANT EXECUTE ON FUNCTION public\.admin_reject_contractor\(uuid, text\) TO authenticated/);
    expect(sql).toMatch(/GRANT EXECUTE ON FUNCTION public\.admin_request_contractor_info\(uuid, text\) TO authenticated/);
    expect(sql).toMatch(/REVOKE ALL ON FUNCTION public\.admin_approve_contractor\(uuid\) FROM PUBLIC, anon/);
    expect(sql).toMatch(/REVOKE ALL ON FUNCTION public\.contractor_approval_item\(uuid\) FROM PUBLIC, anon, authenticated/);
  });

  it("keeps protect-approval triggers and requires RPCs for JWT approval changes", () => {
    expect(sql).toMatch(/protect_contractor_approval/);
    expect(sql).toMatch(/protect_verifier_approval/);
    expect(sql).toMatch(/contractors cannot self-approve or change approval fields/);
    expect(sql).toMatch(/approval changes must go through admin RPCs/);
    expect(sql).toMatch(/ppp_rpc_is\('admin_approve_contractor'\)/);
    expect(sql).toMatch(/ppp_rpc_is\('admin_reject_contractor'\)/);
    expect(sql).toMatch(/ppp_rpc_is\('admin_request_contractor_info'\)/);
    expect(canSelfApprove({ id: "pro-1", accountType: "CONTRACTOR", accountStatus: "PENDING" }, "PENDING", "APPROVED")).toBe(
      false,
    );
    expect(canClientPatchApprovalFields({ id: "admin-1", accountType: "ADMIN", accountStatus: "ACTIVE" })).toBe(false);
  });

  it("approve sets APPROVED + ACTIVE, preserves approved_at, stamps approved_by, and writes audit", () => {
    expect(sql).toMatch(/approval_status = 'APPROVED'/);
    expect(sql).toMatch(/account_status = 'ACTIVE'/);
    expect(sql).toMatch(/approved_at = coalesce\(cp\.approved_at, now\(\)\)/);
    expect(sql).toMatch(/approved_by = auth\.uid\(\)/);
    expect(sql).toMatch(/'contractor\.approved'/);
    expect(sql).toMatch(/write_audit_log/);
  });

  it("reject does not delete, records admin/timestamp/reason, and matching still requires APPROVED", () => {
    expect(sql).toMatch(/approval_status = 'REJECTED'/);
    expect(sql).toMatch(/rejected_at = now\(\)/);
    expect(sql).toMatch(/rejected_by = auth\.uid\(\)/);
    expect(sql).toMatch(/rejection_reason = v_reason/);
    expect(sql).toMatch(/'contractor\.rejected'/);
    expect(sql).toMatch(/deleted', false/);
    expect(sql).not.toMatch(/DELETE FROM public\.contractor_profiles/i);
    expect(sql).not.toMatch(/DELETE FROM public\.profiles/i);
    expect(sql).toMatch(/AND cp\.approval_status = 'APPROVED'/);
  });

  it("request more info stays PENDING and stores message, admin, and timestamp", () => {
    expect(sql).toMatch(/approval_status = 'PENDING'/);
    expect(sql).toMatch(/info_requested_at = now\(\)/);
    expect(sql).toMatch(/info_requested_by = auth\.uid\(\)/);
    expect(sql).toMatch(/info_request_message = v_message/);
    expect(sql).toMatch(/'contractor\.info_requested'/);
    expect(sql).toMatch(/more information can only be requested while the application is pending/);
  });

  it("does not couple approvals to signup fee or flip Stripe live flags", () => {
    const latest = readFileSync(path.join(repoRoot, "supabase/migrations/20260921000001_admin_contractor_approvals.sql"), "utf8");
    expect(latest).toMatch(/signup_fee_does_not_approve/);
    expect(latest).toMatch(/Paying never auto-approves|signup-fee payment never calls this function/i);
    expect(latest).not.toMatch(/payments_live',\s*1/);
    expect(latest).not.toMatch(/charges_live',\s*1/);
    expect(frontend).toMatch(/admin_approve_contractor/);
    expect(frontend).not.toMatch(/from\("contractor_profiles"\)[\s\S]{0,200}approval_status/);
  });

  it("does not weaken Phase 2 RLS tables", () => {
    expect(sql).toMatch(/ALTER TABLE public\.profiles ENABLE ROW LEVEL SECURITY/);
    expect(sql).toMatch(/ALTER TABLE public\.contractor_profiles ENABLE ROW LEVEL SECURITY/);
    expect(sql).toMatch(/ALTER TABLE public\.audit_logs ENABLE ROW LEVEL SECURITY/);
    expect(sql).not.toMatch(/DISABLE ROW LEVEL SECURITY/);
  });
});
