import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ProProfilePage } from "./ProProfilePages";

const api = vi.hoisted(() => ({
  profile: vi.fn(),
  publicRow: vi.fn(),
}));

vi.mock("../../../lib/auth/useAuth", () => ({
  useAuth: () => ({ user: { id: "user-1" }, profile: { id: "user-1", avatar_url: null } }),
}));
vi.mock("../../../hooks/useToast", () => ({ useToast: () => ({ push: vi.fn() }) }));
vi.mock("../../../lib/marketplace/serviceAreaApi", () => ({
  prepareServiceAreaSave: vi.fn(),
  previewServiceRadius: vi.fn(async () => null),
}));
vi.mock("../../../lib/marketplace/api", () => ({
  addCredential: vi.fn(),
  addPortfolioItem: vi.fn(),
  deletePortfolioItem: vi.fn(),
  fetchPortfolioEditorRows: vi.fn(async () => []),
  updatePortfolioItem: vi.fn(),
  fetchContractorAreas: vi.fn(async () => []),
  fetchContractorProfileByUser: () => api.profile(),
  fetchContractorServices: vi.fn(async () => []),
  fetchCredentials: vi.fn(async () => []),
  fetchPublicContractor: (id: string) => api.publicRow(id),
  fetchServiceCategories: vi.fn(async () => []),
  setContractorServices: vi.fn(),
  signedContractorDocUrl: vi.fn(async () => null),
  updateContractorProfile: vi.fn(),
  updateCredential: vi.fn(),
  updateProfileAvatar: vi.fn(),
  uploadContractorDoc: vi.fn(),
  upsertContractorArea: vi.fn(),
}));

function row(approval: string) {
  return {
    id: "cp-1",
    profile_id: "user-1",
    business_name: "Plymate Property Maintenance",
    approval_status: approval,
    onboarding_status: "COMPLETE",
    accepting_work: true,
    headline: "Fences",
    bio: "Local",
    years_experience: 5,
    min_job_cents: null,
    max_job_cents: null,
    license_number: null,
    insurance_carrier: null,
    website_url: null,
    identity_review_required: false,
  };
}

function renderPage() {
  return render(
    <MemoryRouter>
      <ProProfilePage />
    </MemoryRouter>,
  );
}

describe("View public profile link", () => {
  beforeEach(() => {
    api.profile.mockReset();
    api.publicRow.mockReset();
  });

  it("links an approved, listed pro to the storefront", async () => {
    api.profile.mockResolvedValue(row("APPROVED"));
    api.publicRow.mockResolvedValue({ id: "cp-1" });
    renderPage();
    const link = await screen.findByRole("link", { name: "View public profile" });
    expect(link).toHaveAttribute("href", "/find-a-pro/cp-1");
    expect(api.publicRow).toHaveBeenCalledWith("cp-1");
  });

  it("has no link when the directory does not list the pro", async () => {
    api.profile.mockResolvedValue(row("APPROVED"));
    api.publicRow.mockResolvedValue(null);
    renderPage();
    expect(await screen.findByRole("link", { name: "Account settings" })).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "View public profile" })).not.toBeInTheDocument();
  });

  it("does not ask the directory for an unapproved pro", async () => {
    api.profile.mockResolvedValue(row("PENDING"));
    api.publicRow.mockResolvedValue({ id: "cp-1" });
    renderPage();
    await screen.findByRole("heading", { level: 1 });
    expect(api.publicRow).not.toHaveBeenCalled();
    expect(screen.queryByRole("link", { name: "View public profile" })).not.toBeInTheDocument();
  });
});
