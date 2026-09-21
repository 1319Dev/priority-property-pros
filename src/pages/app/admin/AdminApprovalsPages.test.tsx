import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { AuthContext, type AuthContextValue } from "../../../lib/auth/AuthContext";
import { DashboardShell } from "../../../components/layout/DashboardShell";
import { ToastProvider } from "../../../components/ui/Toast";
import {
  filterApprovalQueue,
  type ApprovalTab,
  type ContractorApprovalItem,
} from "../../../lib/admin/approvals";
import { AdminApprovalDetailPage, ApprovalDetailView, ApprovalsQueueView } from "./AdminApprovalsPages";
import * as approvalsApi from "../../../lib/admin/approvalsApi";

vi.mock("../../../lib/admin/approvalsApi", () => ({
  getContractorApproval: vi.fn(),
  adminApproveContractor: vi.fn(),
  adminRejectContractor: vi.fn(),
  adminRequestContractorInfo: vi.fn(),
  listContractorApprovals: vi.fn(),
  countPendingContractorApprovals: vi.fn(),
}));

const pending: ContractorApprovalItem = {
  contractor_profile_id: "cp-1",
  profile_id: "pro-1",
  business_name: "Peachtree Handy",
  contact_name: "Pat Lee",
  first_name: "Pat",
  last_name: "Lee",
  email: "pat@example.com",
  phone: "404-555-0100",
  categories: [{ id: "tv", name: "TV Mounting", slug: "tv-mounting" }],
  service_area: "Atlanta",
  service_areas: [
    {
      id: "area-1",
      mode: "ZIPS",
      center_zip: "30318",
      radius_miles: null,
      zip_codes: ["30318"],
      label: "Primary",
    },
  ],
  applied_at: "2026-09-01T12:00:00Z",
  account_status: "PENDING",
  approval_status: "PENDING",
  onboarding_status: "SUBMITTED",
  headline: "Local TV mounting",
  bio: "Independent contractor.",
  primary_trade: "Handyman",
  years_experience: 8,
  license_number: "GA-123",
  insurance_carrier: "Hartford",
  website_url: "https://example.com",
  accepting_work: true,
  min_job_cents: 8000,
  max_job_cents: 150000,
  approved_at: null,
  approved_by: null,
  rejected_at: null,
  rejected_by: null,
  rejection_reason: null,
  info_requested_at: "2026-09-10T00:00:00Z",
  info_requested_by: "admin-1",
  info_request_message: "Please upload a current certificate of insurance.",
  identity_review_required: false,
  identity_review_at: null,
  identity_review_fields: [],
  credentials: [{ id: "cred-1", kind: "INSURANCE", label: "General liability", status: "PENDING", expires_at: null }],
};

function QueueHarness() {
  const [tab, setTab] = useState<ApprovalTab>("PENDING");
  const approved: ContractorApprovalItem = {
    ...pending,
    contractor_profile_id: "cp-2",
    business_name: "Approved Co",
    approval_status: "APPROVED",
    account_status: "ACTIVE",
    info_request_message: null,
  };
  const items = [pending, approved];
  return (
    <ApprovalsQueueView
      tab={tab}
      counts={{ PENDING: 1, APPROVED: 1, REJECTED: 0, IDENTITY_REVIEW: 0, ALL: 2 }}
      items={filterApprovalQueue(items, tab)}
      loading={false}
      onTabChange={setTab}
    />
  );
}

function renderQueue(tab: ApprovalTab = "PENDING") {
  const items = tab === "PENDING" || tab === "ALL" ? [pending] : [];
  return render(
    <MemoryRouter>
      <ApprovalsQueueView
        tab={tab}
        counts={{ PENDING: 1, APPROVED: 0, REJECTED: 0, IDENTITY_REVIEW: 0, ALL: 1 }}
        items={items}
        loading={false}
        onTabChange={() => undefined}
      />
    </MemoryRouter>,
  );
}

describe("Admin approvals queue UI", () => {
  it("replaces the placeholder with a real queue and required fields", () => {
    renderQueue();
    expect(screen.queryByText(/no approval queue/i)).not.toBeInTheDocument();
    expect(screen.getByRole("tab", { name: /pending/i })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: /approved/i })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: /rejected/i })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: /all/i })).toBeInTheDocument();
    expect(screen.getByText("Peachtree Handy")).toBeInTheDocument();
    expect(screen.getByText("Pat Lee")).toBeInTheDocument();
    expect(screen.getByText("pat@example.com")).toBeInTheDocument();
    expect(screen.getByText("404-555-0100")).toBeInTheDocument();
    expect(screen.getByText("TV Mounting")).toBeInTheDocument();
    expect(screen.getByText(/30318/)).toBeInTheDocument();
    expect(screen.getByText(/sep 1, 2026/i)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /view contractor/i })).toHaveAttribute(
      "href",
      "/app/admin/approvals/cp-1",
    );
  });

  it("switches Pending / Approved / Rejected / All tabs", async () => {
    const user = userEvent.setup();
    render(
      <MemoryRouter>
        <QueueHarness />
      </MemoryRouter>,
    );
    expect(screen.getByText("Peachtree Handy")).toBeInTheDocument();
    await user.click(screen.getByRole("tab", { name: /approved/i }));
    expect(screen.getByText("Approved Co")).toBeInTheDocument();
    expect(screen.queryByText("Peachtree Handy")).not.toBeInTheDocument();
    await user.click(screen.getByRole("tab", { name: /rejected/i }));
    expect(screen.getByText(/nothing in this tab/i)).toBeInTheDocument();
    await user.click(screen.getByRole("tab", { name: /^all/i }));
    expect(screen.getByText("Peachtree Handy")).toBeInTheDocument();
    expect(screen.getByText("Approved Co")).toBeInTheDocument();
  });

  it("shows approve, reject, request-info, and stored info request on the detail", async () => {
    const user = userEvent.setup();
    const clicks: string[] = [];
    render(
      <MemoryRouter>
        <ApprovalDetailView
          item={pending}
          onApprove={() => clicks.push("approve")}
          onReject={() => clicks.push("reject")}
          onRequestInfo={() => clicks.push("info")}
        />
      </MemoryRouter>,
    );
    expect(screen.getByText("Please upload a current certificate of insurance.")).toBeInTheDocument();
    expect(screen.getByText("GA-123")).toBeInTheDocument();
    expect(screen.getByText("Hartford")).toBeInTheDocument();
    expect(screen.getByText(/general liability/i)).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: /^approve$/i }));
    await user.click(screen.getByRole("button", { name: /^reject$/i }));
    await user.click(screen.getByRole("button", { name: /request more information/i }));
    expect(clicks).toEqual(["approve", "reject", "info"]);
  });

  it("asks for confirmation before approve or reject", async () => {
    const user = userEvent.setup();
    vi.mocked(approvalsApi.getContractorApproval).mockResolvedValue(pending);
    vi.mocked(approvalsApi.adminApproveContractor).mockResolvedValue({
      ...pending,
      approval_status: "APPROVED",
      account_status: "ACTIVE",
    });
    vi.mocked(approvalsApi.adminRejectContractor).mockResolvedValue({
      ...pending,
      approval_status: "REJECTED",
    });

    render(
      <MemoryRouter initialEntries={["/app/admin/approvals/cp-1"]}>
        <ToastProvider>
          <Routes>
            <Route path="/app/admin/approvals/:contractorProfileId" element={<AdminApprovalDetailPage />} />
          </Routes>
        </ToastProvider>
      </MemoryRouter>,
    );

    expect(await screen.findByRole("heading", { name: "Peachtree Handy" })).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: /^approve$/i }));
    expect(screen.getByRole("heading", { name: /approve this contractor/i })).toBeInTheDocument();
    expect(approvalsApi.adminApproveContractor).not.toHaveBeenCalled();
    await user.click(screen.getByRole("button", { name: /approve contractor/i }));
    expect(approvalsApi.adminApproveContractor).toHaveBeenCalledWith("cp-1");

    await user.click(screen.getByRole("button", { name: /^reject$/i }));
    expect(screen.getByRole("heading", { name: /reject this application/i })).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: /reject application/i }));
    expect(approvalsApi.adminRejectContractor).toHaveBeenCalled();
  });
});

describe("Admin Approvals nav badge", () => {
  beforeEach(() => {
    vi.mocked(approvalsApi.countPendingContractorApprovals).mockReset();
  });

  it("renders the pending count next to Approvals", () => {
    const value: AuthContextValue = {
      configured: true,
      loading: false,
      user: { id: "admin-1", email: "ada@example.com" } as AuthContextValue["user"],
      session: null,
      profile: {
        id: "admin-1",
        email: "ada@example.com",
        first_name: "Ada",
        last_name: "Admin",
        phone: null,
        avatar_url: null,
        account_type: "ADMIN",
        account_status: "ACTIVE",
        created_at: "2026-01-01T00:00:00Z",
        updated_at: "2026-01-01T00:00:00Z",
      },
      account_type: "ADMIN",
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

    render(
      <AuthContext.Provider value={value}>
        <MemoryRouter>
          <DashboardShell
            eyebrow="Admin"
            items={[
              { to: "/app/admin", label: "Overview", end: true },
              { to: "/app/admin/approvals", label: "Approvals", badge: 3 },
            ]}
          />
        </MemoryRouter>
      </AuthContext.Provider>,
    );

    expect(screen.getAllByLabelText("3 pending").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Approvals").length).toBeGreaterThan(0);
  });
});
