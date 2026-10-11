import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { PUBLIC_ABOUT_FALLBACK, publicAboutForViewer } from "./publicDirectory";
import { connectionActionsOpen } from "./contractorJobActions";
import { mergeRecoveredJobLabels, safeJobTitle } from "./opportunityLabels";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const migration = readFileSync(
  path.join(root, "supabase/migrations/20261016000003_opportunity_label_reads.sql"),
  "utf8",
);
const rollback = readFileSync(
  path.join(root, "supabase/rollbacks/20261016000003_opportunity_label_reads_rollback.sql"),
  "utf8",
);

describe("recovered job labels", () => {
  it("keeps a PPP number and drops a title that contains contact", () => {
    expect(safeJobTitle("Call 9367188184")).toBeNull();
    expect(safeJobTitle("Fence repair")).toBe("Fence repair");
    const labels = mergeRecoveredJobLabels([
      { project_id: "p1", project_title: "12 Oak Street", project_reference_number: 1004 },
      { project_id: "p1", project_title: "Fence repair", project_reference_number: "1004" },
    ]);
    expect(labels.p1?.title).toBe("Fence repair");
    expect(labels.p1?.reference_number).toBe(1004);
    expect(JSON.stringify(labels)).not.toMatch(/Oak Street|936/);
  });

  it("leaves passed and closed jobs with no connection actions", () => {
    expect(connectionActionsOpen({ opportunityStatus: "PASSED", projectStatus: "POSTED" })).toBe(false);
    expect(connectionActionsOpen({ opportunityStatus: "CLOSED", projectStatus: "POSTED" })).toBe(false);
    expect(connectionActionsOpen({ opportunityStatus: "EXPIRED" })).toBe(false);
    expect(connectionActionsOpen({ opportunityStatus: "AVAILABLE", projectStatus: "CANCELLED" })).toBe(false);
    expect(connectionActionsOpen({ opportunityStatus: "AVAILABLE", projectStatus: "POSTED" })).toBe(true);
    expect(connectionActionsOpen({ opportunityStatus: "ACCEPTED", projectStatus: "MATCHING" })).toBe(true);
  });

  it("changes the public about line only after this customer is already connected", () => {
    expect(publicAboutForViewer(PUBLIC_ABOUT_FALLBACK, false)).toMatch(/after you connect/i);
    const connected = publicAboutForViewer(PUBLIC_ABOUT_FALLBACK, true);
    expect(connected).toMatch(/already connected/i);
    expect(connected).not.toMatch(/Plymate|business name|936|Oak Street/i);
    expect(publicAboutForViewer("We repair fences in Conroe.", true)).toBe("We repair fences in Conroe.");
  });

  it("reads only a scrubbed title and reference for the signed-in contractor", () => {
    expect(migration).toMatch(/list_my_opportunity_labels/);
    expect(migration).toMatch(/current_contractor_profile_id\(\)/);
    expect(migration).toMatch(/project_reference_number/);
    expect(migration).toMatch(/text_contains_pre_hire_contact\(p\.title\)/);
    expect(migration).toMatch(/GRANT EXECUTE ON FUNCTION public\.list_my_opportunity_labels\(\) TO authenticated/);
    expect(migration).not.toMatch(/street_line1|p\.phone|p\.email|zip_code/);
    expect(migration).not.toMatch(/INSERT\s+INTO/i);
    expect(migration).not.toMatch(/stripe|connection_fee/i);
    expect(rollback).toMatch(/DROP FUNCTION IF EXISTS public\.list_my_opportunity_labels/);
  });
});
