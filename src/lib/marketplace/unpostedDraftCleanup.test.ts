import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const migrationName = "20261010000001_delete_unposted_draft_projects.sql";

function read(relativePath: string): string {
  return readFileSync(path.join(repoRoot, relativePath), "utf8");
}

describe("unposted draft cleanup migration", () => {
  const sql = read(`supabase/migrations/${migrationName}`);

  it("deletes only never-posted DRAFT projects and their photo files", () => {
    expect(sql).toMatch(/p\.status = 'DRAFT'/);
    expect(sql).toMatch(/p\.posted_at IS NULL/);
    expect(sql).toMatch(/NOT EXISTS \(SELECT 1 FROM public\.opportunities/);
    expect(sql).toMatch(/NOT EXISTS \(SELECT 1 FROM public\.project_connections/);
    expect(sql).toMatch(/NOT EXISTS \(SELECT 1 FROM public\.connection_checkout_sessions/);
    expect(sql).toMatch(/NOT EXISTS \(SELECT 1 FROM public\.project_message_threads/);
    expect(sql).toMatch(/NOT EXISTS \(\s*SELECT 1\s*FROM public\.project_messages/);
    expect(sql).toMatch(/NOT EXISTS \(SELECT 1 FROM public\.bookings/);
    expect(sql).toMatch(/NOT EXISTS \(SELECT 1 FROM public\.estimates/);
    expect(sql).toMatch(/NOT EXISTS \(SELECT 1 FROM public\.booking_contact_access/);
    expect(sql).toMatch(/DELETE FROM storage\.objects/);
    expect(sql).toMatch(/bucket_id = 'project-photos'/);
    expect(sql).toMatch(/DELETE FROM public\.project_photos/);
    expect(sql).toMatch(/DELETE FROM public\.project_answers/);
    expect(sql).toMatch(/DELETE FROM public\.project_private_locations/);
    expect(sql).toMatch(/DELETE FROM public\.projects p/);
    expect(sql).toMatch(/AND p\.status = 'DRAFT'/);
    expect(sql).toMatch(/AND p\.posted_at IS NULL/);
  });

  it("does not delete posted projects, payments, messages, or estimates", () => {
    expect(sql).not.toMatch(/DELETE FROM public\.bookings/);
    expect(sql).not.toMatch(/DELETE FROM public\.estimates/);
    expect(sql).not.toMatch(/DELETE FROM public\.opportunities/);
    expect(sql).not.toMatch(/DELETE FROM public\.project_connections/);
    expect(sql).not.toMatch(/DELETE FROM public\.connection_checkout_sessions/);
    expect(sql).not.toMatch(/DELETE FROM public\.project_messages/);
    expect(sql).not.toMatch(/DELETE FROM public\.project_message_threads/);
    expect(sql).not.toMatch(/payments_live/);
    expect(sql).not.toMatch(/charges_live/);
    expect(sql).not.toMatch(/UPDATE public\.projects/);
    expect(sql).not.toMatch(/UPDATE public\.connection_checkout_sessions/);
    expect(sql).not.toMatch(/UPDATE public\.project_connections/);
    expect(sql).not.toMatch(/status = 'POSTED'/);
  });
});

describe("customer screens do not offer unfinished drafts", () => {
  const home = read("src/pages/app/customer/CustomerMarketplacePages.tsx");
  const wizard = read("src/pages/app/customer/ProjectWizardPage.tsx");
  const edit = read("src/pages/app/customer/ProjectEditPage.tsx");
  const api = read("src/lib/marketplace/api.ts");

  it("drops Finish project and untitled draft cards from Home and Projects", () => {
    expect(home).not.toMatch(/Finish project/);
    expect(home).not.toMatch(/Untitled draft/);
    expect(home).not.toMatch(/No drafts/);
    expect(home).not.toMatch(/This project was never posted/);
    expect(home).not.toMatch(/Delete permanently/);
    expect(edit).not.toMatch(/This project was never posted/);
    expect(home).toMatch(/customerVisibleProjects/);
    expect(edit).not.toMatch(/Finish project/);
    expect(wizard).not.toMatch(/createOrReuseDraftProject|createDraftProject|updateProject\(/);
    expect(wizard).toMatch(/submitNewProject/);
    expect(api).not.toMatch(/createOrReuseDraftProject|createDraftProject/);
    expect(api).toMatch(/export async function submitNewProject/);
    expect(api).toMatch(/discardUnpostedProject/);
  });
});
