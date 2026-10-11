import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { registerAdminStepUpHandler } from "../auth/adminStepUp";
import {
  buildContractorPatch,
  buildCustomerPatch,
  describePatch,
  normalizePhone,
  parseContractorEditor,
  parseCustomerEditor,
  patchNeedsStepUp,
  saveContractorProfile,
  saveCustomerProfile,
  validateReason,
} from "./profileEditorApi";

const rpc = vi.fn();
vi.mock("../supabase/client", () => ({
  getSupabaseClient: () => ({ rpc: (...args: unknown[]) => rpc(...args) }),
}));

const customerRaw = {
  profile_id: "c1",
  first_name: "Owen",
  last_name: "Home",
  email: "owen@example.com",
  phone: "2815550100",
  avatar_url: null,
  account_status: "ACTIVE",
  location: null,
  notifications: [{ category: "messages", in_app: true, push: false, email: true }],
  projects: [
    {
      project_id: "p1",
      reference_number: 1004,
      title: "Fence stain",
      description: "Stain the back fence",
      category_id: "cat1",
      city: "Conroe",
      state: "TX",
      zip_code: "77301",
      street_line1: null,
      street_line2: null,
      timing: "FLEXIBLE",
      preferred_date: null,
      status: "POSTED",
    },
  ],
  categories: [{ id: "cat1", name: "Fencing" }],
};

const contractorRaw = {
  contractor_profile_id: "k1",
  profile_id: "kp1",
  business_name: "Pat Pro LLC",
  first_name: "Pat",
  last_name: "Pro",
  email: "pat@example.com",
  phone: "7135550100",
  avatar_url: null,
  bio: "Decks and fences",
  headline: null,
  primary_trade: "Fencing",
  license_number: null,
  insurance_carrier: null,
  approval_status: "APPROVED",
  account_status: "ACTIVE",
  directory_hidden: false,
  directory_listed: true,
  services: [{ category_id: "cat1", name: "Fencing" }],
  service_areas: [{ id: "a1", mode: "ZIPS", label: "Conroe", center_zip: null, radius_miles: null, zip_codes: ["77301"] }],
  credentials: [{ id: "cr1", kind: "LICENSE", label: "TX license", status: "PENDING", expires_at: null }],
  portfolio: [{ id: "ph1", title: "Deck", description: null, privacy_state: "REVIEW_REQUIRED" }],
  categories: [
    { id: "cat1", name: "Fencing" },
    { id: "cat2", name: "Decks" },
  ],
};

beforeEach(() => {
  rpc.mockReset();
});
afterEach(() => registerAdminStepUpHandler(null));

describe("customer patches", () => {
  it("sends only the fields that changed", () => {
    const original = parseCustomerEditor(customerRaw);
    const draft = structuredClone(original);
    draft.firstName = "Owen J";
    draft.projects[0].title = "Fence stain and seal";
    draft.notifications[0].push = true;
    expect(buildCustomerPatch(original, draft)).toEqual({
      first_name: "Owen J",
      notifications: [{ category: "messages", in_app: true, push: true, email: true }],
      projects: [{ project_id: "p1", title: "Fence stain and seal" }],
    });
  });

  it("returns an empty patch when nothing changed", () => {
    const original = parseCustomerEditor(customerRaw);
    expect(buildCustomerPatch(original, structuredClone(original))).toEqual({});
  });

  it("normalizes phone like the signup form and flags sensitive keys", () => {
    expect(normalizePhone("(281) 555-0142")).toBe("2815550142");
    expect(normalizePhone("+1 281 555 0142")).toBe("2815550142");
    expect(() => normalizePhone("555-0142")).toThrow("Enter a 10-digit phone number.");
    const original = parseCustomerEditor(customerRaw);
    const draft = { ...structuredClone(original), phone: "281-555-0142", email: "OWEN.NEW@example.com " };
    const patch = buildCustomerPatch(original, draft);
    expect(patch).toEqual({ phone: "2815550142", email: "owen.new@example.com" });
    expect(patchNeedsStepUp(patch)).toBe(true);
    expect(patchNeedsStepUp({ first_name: "x" })).toBe(false);
    expect(patchNeedsStepUp({ portfolio: [{ id: "p1", privacy_state: "PUBLIC_SAFE" }] })).toBe(true);
    expect(patchNeedsStepUp({ credentials: [{ id: "c1", status: "VERIFIED" }] })).toBe(true);
    expect(patchNeedsStepUp({ portfolio: [{ id: "p1", title: "Deck" }] })).toBe(false);
  });

  it("blocks contact info in public text and bad ZIPs before calling the server", () => {
    const original = parseCustomerEditor(customerRaw);
    const draft = structuredClone(original);
    draft.projects[0].description = "Text me at 281-555-0199";
    expect(() => buildCustomerPatch(original, draft)).toThrow(/keep communication/);
    const zip = structuredClone(original);
    zip.location.zipCode = "7730";
    expect(() => buildCustomerPatch(original, zip)).toThrow("Enter a 5-digit ZIP code.");
  });
});

describe("contractor patches", () => {
  it("covers services, areas, credentials, photos, approval, and visibility", () => {
    const original = parseContractorEditor(contractorRaw);
    const draft = structuredClone(original);
    draft.serviceCategoryIds = ["cat1", "cat2"];
    draft.serviceAreas[0].zipCodes = "77301, 77302";
    draft.credentials[0].status = "VERIFIED";
    draft.portfolio[0].privacyState = "PUBLIC_SAFE";
    draft.portfolio[0].title = "Cedar deck";
    draft.directoryHidden = true;
    draft.approvalStatus = "SUSPENDED";
    const patch = buildContractorPatch(original, draft);
    expect(patch).toEqual({
      approval_status: "SUSPENDED",
      directory_hidden: true,
      service_category_ids: ["cat1", "cat2"],
      service_areas: [{ id: "a1", mode: "ZIPS", label: "Conroe", center_zip: null, radius_miles: null, zip_codes: ["77301", "77302"] }],
      credentials: [{ id: "cr1", status: "VERIFIED" }],
      portfolio: [{ id: "ph1", title: "Cedar deck", privacy_state: "PUBLIC_SAFE" }],
    });
    expect(describePatch(patch)).toContain("Directory visibility");
    expect(JSON.stringify(patch)).not.toMatch(/stripe|fee|amount|payment/i);
  });

  it("rejects contact info in the bio and an out-of-range radius", () => {
    const original = parseContractorEditor(contractorRaw);
    expect(() => buildContractorPatch(original, { ...structuredClone(original), bio: "Email pat@example.com" })).toThrow(/keep communication/);
    const draft = structuredClone(original);
    draft.serviceAreas[0] = { ...draft.serviceAreas[0], mode: "RADIUS", centerZip: "77301", radiusMiles: "500" };
    expect(() => buildContractorPatch(original, draft)).toThrow("Enter a radius between 1 and 200 miles.");
  });
});

describe("saving", () => {
  it("requires a reason and never sends money keys", async () => {
    expect(() => validateReason("  ")).toThrow(/reason/);
    await expect(saveCustomerProfile("c1", { first_name: "X" }, "")).rejects.toThrow(/reason/);
    await expect(saveCustomerProfile("c1", { signup_fee_status: "PAID" }, "Fix it")).rejects.toThrow(/not editable/);
    await expect(saveContractorProfile("k1", { portfolio: [{ id: "ph1", stripe_x: 1 }] }, "Fix it")).rejects.toThrow(/not editable/);
    expect(rpc).not.toHaveBeenCalled();
  });

  it("calls the admin RPC with the patch and reason", async () => {
    rpc.mockResolvedValue({ data: customerRaw, error: null });
    const saved = await saveCustomerProfile("c1", { first_name: "Owen J" }, "Customer asked by phone");
    expect(rpc).toHaveBeenCalledWith("admin_update_customer_profile", {
      p_profile_id: "c1",
      p_patch: { first_name: "Owen J" },
      p_reason: "Customer asked by phone",
    });
    expect(saved.profileId).toBe("c1");
  });

  it("asks for a fresh code once when the server requires step-up, then retries", async () => {
    rpc
      .mockResolvedValueOnce({ data: null, error: { message: "admin step-up required" } })
      .mockResolvedValueOnce({ data: contractorRaw, error: null });
    const handler = vi.fn().mockResolvedValue(true);
    registerAdminStepUpHandler(handler);
    const saved = await saveContractorProfile("k1", { approval_status: "SUSPENDED" }, "Insurance lapsed");
    expect(handler).toHaveBeenCalledTimes(1);
    expect(rpc).toHaveBeenCalledTimes(2);
    expect(saved.contractorProfileId).toBe("k1");
  });

  it("shows a plain error when the server refuses a non-admin", async () => {
    rpc.mockResolvedValue({ data: null, error: { message: "not authorized", code: "42501" } });
    await expect(saveCustomerProfile("c1", { first_name: "X" }, "Fix it")).rejects.toThrow("You need an admin sign-in to do that.");
  });
});

describe("editor error wording", () => {
  it("passes the editor's own validation sentences through and hides anything else", async () => {
    const { friendlyAdminError } = await import("./friendlyAdminError");
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    for (const message of [
      "Enter a 10-digit phone number.",
      "That email is already in use.",
      "payment records and fee status are not editable here",
      "directory visibility is set by Priority Property Pros",
      "bio must be 2000 characters or fewer",
      "Nothing to change.",
    ]) {
      expect(friendlyAdminError({ message }, "fallback")).toBe(message);
    }
    expect(friendlyAdminError({ message: 'relation "x" does not exist' }, "fallback")).toBe("fallback");
    expect(friendlyAdminError({ message: "admin step-up required" }, "fallback")).toMatch(/authenticator code/);
  });
});
