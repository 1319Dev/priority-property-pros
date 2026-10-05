import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { CHARGES_LIVE, PAYMENTS_LIVE } from "./types";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const migrationName = "20261008000001_customer_contact_share.sql";

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

describe("customer contact share SQL", () => {
  const sql = migrationSql();
  const share = functionBody(sql, "share_project_contact");
  const read = functionBody(sql, "get_shared_project_contact");
  const booking = functionBody(sql, "booking_job_contact");
  const project = functionBody(sql, "project_job_contact");
  const fields = functionBody(sql, "shared_contact_fields");
  const location = functionBody(sql, "contractor_may_read_shared_location");

  it("stores consent without contact columns and blocks client writes", () => {
    expect(sql).toMatch(/CREATE TABLE public\.project_contact_shares/);
    expect(sql).toMatch(/CONSTRAINT project_contact_shares_pair UNIQUE \(project_id, contractor_profile_id\)/);
    expect(sql).toMatch(/ALTER TABLE public\.project_contact_shares ENABLE ROW LEVEL SECURITY/);
    expect(sql).toMatch(/GRANT SELECT ON TABLE public\.project_contact_shares TO authenticated/);
    expect(sql).not.toMatch(/GRANT INSERT ON TABLE public\.project_contact_shares/);
    expect(sql).not.toMatch(/GRANT UPDATE ON TABLE public\.project_contact_shares/);
    expect(sql).not.toMatch(/GRANT DELETE ON TABLE public\.project_contact_shares/);
    expect(sql).not.toMatch(/phone text/);
    expect(sql).not.toMatch(/email text/);
    expect(sql).not.toMatch(/street_line1 text/);
    expect(sql).toMatch(/contact share cannot be written from the client/);
    expect(sql).not.toMatch(/TO anon/);
    expect(sql).toMatch(/DELETE FROM public\.project_contact_shares/);
  });

  it("requires the $4.99 connection entitlement or admin override and does not write a message", () => {
    expect(share).toMatch(/only the customer can share contact on this project/);
    expect(share).toMatch(/message_pair_has_connection_entitlement/);
    expect(share).toMatch(/contact share is locked until the \$4\.99 connection entitlement/);
    expect(share).toMatch(/INSERT INTO public\.project_contact_shares/);
    expect(share).toMatch(/ON CONFLICT \(project_id, contractor_profile_id\) DO NOTHING/);
    expect(share).not.toMatch(/INSERT INTO public\.project_messages/);
    expect(share).not.toMatch(/'phone'/);
    expect(share).not.toMatch(/'email'/);
    expect(share).not.toMatch(/'street/);
    expect(share).toMatch(/'contact\.shared'/);
    expect(share).toMatch(/The customer shared project contact with you\./);
    expect(share).toMatch(/'project_id', p_project_id/);
    expect(share).toMatch(/'contractor_profile_id', p_contractor_profile_id/);
    expect(read).toMatch(/message_pair_has_connection_entitlement/);
    expect(read).toMatch(/'eligible', false/);
    expect(read).toMatch(/v_customer OR v_shared/);
    expect(location).toMatch(/customer_has_shared_project_contact/);
    expect(location).toMatch(/message_pair_has_connection_entitlement/);
  });

  it("reads name, phone, email, and the stored project address, not coordinates", () => {
    expect(fields).toMatch(/cust\.first_name/);
    expect(fields).toMatch(/cust\.last_name/);
    expect(fields).toMatch(/cust\.phone/);
    expect(fields).toMatch(/cust\.email/);
    expect(fields).toMatch(/loc\.street_line1/);
    expect(fields).toMatch(/loc\.street_line2/);
    expect(fields).toMatch(/proj\.city/);
    expect(fields).toMatch(/proj\.zip_code/);
    expect(fields).not.toMatch(/loc\.lat/);
    expect(fields).not.toMatch(/loc\.lng/);
    expect(sql).toMatch(/REVOKE ALL ON FUNCTION public\.shared_contact_fields\(uuid\) FROM PUBLIC, anon, authenticated/);
    expect(sql).not.toMatch(/GRANT EXECUTE ON FUNCTION public\.shared_contact_fields/);
  });

  it("does not reveal booking contact to a contractor before the customer shares", () => {
    const beforeSelect = booking.slice(0, booking.indexOf("SELECT * INTO loc"));
    expect(beforeSelect).toMatch(/Missing row is LOCKED/);
    expect(beforeSelect).toMatch(/entitled := public\.booking_has_contact_access\(b\.id\)/);
    expect(beforeSelect).toMatch(/is_hired AND entitled/);
    expect(beforeSelect).toMatch(/customer_has_shared_project_contact/);
    expect(beforeSelect).toMatch(/'customer_shared', false/);
    expect(beforeSelect).not.toMatch(/'street_line1'/);
    expect(beforeSelect).not.toMatch(/'phone'/);
    expect(beforeSelect).not.toMatch(/'email'/);
    expect(beforeSelect).not.toMatch(/loc\.lat/);
    expect(booking).toMatch(/ACCEPTED estimate status and CONFIRMED booking status are not consulted/);
    const projectBefore = project.slice(0, project.indexOf("SELECT * INTO loc"));
    expect(projectBefore).toMatch(/'customer_shared', false/);
    expect(projectBefore).not.toMatch(/'phone'/);
    expect(projectBefore).not.toMatch(/'street_line1'/);
  });

  it("does not change payment flags, prices, or checkout", () => {
    expect(PAYMENTS_LIVE).toBe(false);
    expect(CHARGES_LIVE).toBe(false);
    expect(sql).not.toMatch(/payments_live',\s*1/);
    expect(sql).not.toMatch(/charges_live',\s*1/);
    expect(sql).not.toMatch(/signup_fee_enabled/);
    expect(sql).not.toMatch(/stripe/i);
    expect(sql).not.toMatch(/fee_cents/);
    expect(sql).not.toMatch(/unit_amount/);
    expect(sql).toMatch(/contractor_may_read_shared_location\(project_id\)/);
    expect(sql).not.toMatch(/contractor_has_contact_access_on_project\(project_id\)/);
  });
});
