import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { MemoryRouter } from "react-router-dom";
import { ContractorConnectionCta } from "../../../components/marketplace/ContractorConnectionCta";
import { EndJobDialog } from "../../../components/marketplace/EndJobDialog";
import { ToastProvider } from "../../../components/ui/Toast";
import { AuthContext, type AuthContextValue } from "../../../lib/auth/AuthContext";
import { CONNECT_BUTTON_LABEL } from "../../../lib/marketplace/connectionLifecycle";
import {
  CONNECT_SINGLE_STEP_COPY,
  PASS_SKIP_CONFIRM,
  PASS_SKIP_LABEL,
  PASS_SKIP_TITLE,
} from "../../../lib/marketplace/contractorJobActions";
import { opportunityNextActions } from "../../../lib/marketplace/statusLabels";
import * as marketplaceApi from "../../../lib/marketplace/api";
import { OpportunitiesPage } from "./ProMarketplacePages";

vi.mock("../../../lib/marketplace/api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../../lib/marketplace/api")>();
  return {
    ...actual,
    fetchContractorProfileByUser: vi.fn(),
    fetchMyOpportunities: vi.fn(),
    endContractorJob: vi.fn(),
  };
});

const pageFile = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "ProMarketplacePages.tsx");

describe("contractor job detail UX", () => {
  const page = readFileSync(pageFile, "utf8");

  it("uses one Connect CTA and Pass on this job for unpaid skip", () => {
    expect(page).toMatch(/runContractorConnect/);
    expect(page).toMatch(/acceptOpportunity/);
    expect(page).toMatch(/endContractorJob/);
    expect(page).toMatch(/EndJobDialog/);
    expect(page).toMatch(/declineJobButtonLabel/);
    expect(page).toMatch(/declineJobToast/);
    expect(page).toMatch(/setError\(null\)/);
    expect(page).toMatch(/opportunityListTitle/);
    expect(page).toMatch(/CONNECT_SINGLE_STEP_COPY/);
    expect(page).not.toMatch(/>\s*Participate\s*</);
    expect(page).not.toMatch(/Job ended\. History was kept/);
    expect(opportunityNextActions({ opportunityId: "o1", status: "AVAILABLE", projectStatus: "POSTED" })[0]?.label).toBe(
      "Connect",
    );
  });

  it("keeps Connect and Pass obvious at ~390px, including the unpaid confirm modal", () => {
    const { rerender } = render(
      <div className="mx-auto w-[390px] max-w-[390px] space-y-3">
        <p>{CONNECT_SINGLE_STEP_COPY}</p>
        <ContractorConnectionCta state="connect" onConnect={() => undefined} />
        <button type="button">{PASS_SKIP_LABEL}</button>
      </div>,
    );
    expect(screen.getByText(/do not need a separate Participate step/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: CONNECT_BUTTON_LABEL })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: PASS_SKIP_LABEL })).toBeInTheDocument();

    rerender(
      <div className="mx-auto w-[390px] max-w-[390px]">
        <EndJobDialog open busy={false} connectionStatus="PAYMENT_DISABLED" onConfirm={() => undefined} onClose={() => undefined} />
      </div>,
    );
    expect(screen.getByRole("heading", { name: PASS_SKIP_TITLE })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: PASS_SKIP_CONFIRM })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /keep this job/i })).toBeInTheDocument();
    expect(screen.getByText(/passing removes this job from your list/i)).toBeInTheDocument();
    expect(screen.getByText(/next best-suited contractor can be invited/i)).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: /end this job/i })).not.toBeInTheDocument();
  });
});

describe("estimate builder delete vs withdraw", () => {
  const page = readFileSync(pageFile, "utf8");
  const customerPage = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../customer/CustomerMarketplacePages.tsx");
  const customer = readFileSync(customerPage, "utf8");

  it("deletes drafts through confirm + RPC and keeps withdraw for sent estimates", () => {
    expect(page).toMatch(/deleteEstimate/);
    expect(page).toMatch(/DELETE_ESTIMATE_TITLE/);
    expect(page).toMatch(/contractorEstimateDestructiveAction/);
    expect(page).toMatch(/withdrawEstimate/);
    expect(page).toMatch(/WITHDRAW_ESTIMATE_TITLE/);
    expect(page).toMatch(/It is not deleted|WITHDRAW_ESTIMATE_BODY/);
    expect(page).toMatch(/navigate\("\/app\/pro\/estimates"\)/);
    expect(customer).not.toMatch(/deleteEstimate\(/);
    expect(customer).not.toMatch(/DELETE_ESTIMATE/);
  });
});

const passedRow = {
  id: "opp-passed",
  project_id: "proj-hidden",
  contractor_profile_id: "pro-1",
  match_id: null,
  status: "PASSED" as const,
  available_at: "2026-09-20T00:00:00Z",
  responded_at: "2026-09-21T00:00:00Z",
  expires_at: null,
  created_at: "2026-09-20T00:00:00Z",
  projects: null,
};

const openRow = {
  id: "opp-open",
  project_id: "proj-live",
  contractor_profile_id: "pro-1",
  match_id: null,
  status: "AVAILABLE" as const,
  available_at: "2026-09-21T00:00:00Z",
  responded_at: null,
  expires_at: null,
  created_at: "2026-09-21T00:00:00Z",
  projects: {
    id: "proj-live",
    title: "Kitchen faucet",
    description: "Replace faucet",
    city: "Atlanta",
    state: "GA",
    zip_code: "30318",
    timing: "ASAP" as const,
    budget_min_cents: null,
    budget_max_cents: null,
    status: "POSTED" as const,
    completeness: "HIGH" as const,
    category_id: "cat-1",
    preferred_date: null,
    accepting_connections: true,
  },
};

function renderJobsPage() {
  const value: AuthContextValue = {
    configured: true,
    loading: false,
    user: { id: "user-1", email: "pat@example.com" } as AuthContextValue["user"],
    session: null,
    profile: {
      id: "user-1",
      email: "pat@example.com",
      first_name: "Pat",
      last_name: "Lee",
      phone: null,
      avatar_url: null,
      account_type: "CONTRACTOR",
      account_status: "ACTIVE",
      created_at: "2026-01-01T00:00:00Z",
      updated_at: "2026-01-01T00:00:00Z",
    },
    account_type: "CONTRACTOR",
    account_status: "ACTIVE",
    signup_fee_status: "NOT_REQUIRED",
    signup_fee_enabled: false,
    signIn: async () => ({ error: null }),
    signUp: async () => ({ error: null, needsEmailConfirm: true }),
    signOut: async () => undefined,
    refreshProfile: async () => undefined,
    requestPasswordReset: async () => ({ error: null }),
    updatePassword: async () => ({ error: null }),
    resendVerification: async () => ({ error: null }),
  };
  return render(
    <AuthContext.Provider value={value}>
      <ToastProvider>
        <MemoryRouter>
          <div className="mx-auto w-[390px] max-w-[390px]">
            <OpportunitiesPage />
          </div>
        </MemoryRouter>
      </ToastProvider>
    </AuthContext.Provider>,
  );
}

describe("Jobs page after passing a job", () => {
  beforeEach(() => {
    vi.mocked(marketplaceApi.fetchContractorProfileByUser).mockReset();
    vi.mocked(marketplaceApi.fetchMyOpportunities).mockReset();
    vi.mocked(marketplaceApi.endContractorJob).mockReset();
    vi.mocked(marketplaceApi.fetchContractorProfileByUser).mockResolvedValue({
      id: "pro-1",
      profile_id: "user-1",
    } as Awaited<ReturnType<typeof marketplaceApi.fetchContractorProfileByUser>>);
    vi.mocked(marketplaceApi.endContractorJob).mockResolvedValue({ status: "PASSED" });
  });

  it("does not show Project not found when a passed job has no readable project", async () => {
    vi.mocked(marketplaceApi.fetchMyOpportunities).mockResolvedValue([passedRow]);
    renderJobsPage();
    expect(await screen.findByRole("heading", { name: "Jobs" })).toBeInTheDocument();
    expect(screen.getByText("No open jobs")).toBeInTheDocument();
    expect(screen.getByText("Passed job")).toBeInTheDocument();
    expect(screen.getByText(/you passed on this job/i)).toBeInTheDocument();
    expect(screen.queryByText("Project not found.")).not.toBeInTheDocument();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("reloads without a sticky error after Pass succeeds", async () => {
    vi.mocked(marketplaceApi.fetchMyOpportunities).mockImplementation(async () => {
      if (vi.mocked(marketplaceApi.endContractorJob).mock.calls.length > 0) return [passedRow];
      return [openRow];
    });
    renderJobsPage();
    expect(await screen.findByText("Kitchen faucet")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: PASS_SKIP_LABEL }));
    const dialog = await screen.findByRole("dialog");
    await userEvent.click(within(dialog).getByRole("button", { name: PASS_SKIP_CONFIRM }));
    await waitFor(() => {
      expect(screen.getByText("No open jobs")).toBeInTheDocument();
    });
    expect(screen.getByText("Passed job")).toBeInTheDocument();
    expect(screen.queryByText("Project not found.")).not.toBeInTheDocument();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(marketplaceApi.endContractorJob).toHaveBeenCalledWith("opp-open");
    expect(marketplaceApi.fetchMyOpportunities).toHaveBeenCalled();
  });
});
