import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { mockAdminViewport } from "../../../../../test/adminViewport";
import type { ContractorDetail, ContractorRow } from "../../../../../lib/admin/contractorsApi";
import { ContractorDetailPage, ContractorsLayout } from "./ContractorsPages";

const fetchContractors = vi.fn();
const fetchContractor = vi.fn();

vi.mock("../../../../../lib/admin/contractorsApi", async () => {
  const actual = await vi.importActual<typeof import("../../../../../lib/admin/contractorsApi")>(
    "../../../../../lib/admin/contractorsApi",
  );
  return {
    ...actual,
    fetchContractors: (...args: unknown[]) => fetchContractors(...args),
    fetchContractor: (...args: unknown[]) => fetchContractor(...args),
  };
});

const row: ContractorRow = {
  contractorProfileId: "cp-1",
  profileId: "pro-1",
  businessName: "Plymate Example",
  trades: ["Handyman", "TV Mounting"],
  area: "Conroe, Montgomery County 77301",
  approvalStatus: "APPROVED",
  accountStatus: "ACTIVE",
  signupFeeStatus: "PAID",
  rating: 5,
  reviewCount: 1,
  jobCount: 1,
  estimateCount: 1,
  flag: null,
};

const detail: ContractorDetail = {
  ...row,
  email: "pat@example.com",
  flagNote: null,
  jobs: [
    {
      bookingId: "book-1",
      projectId: "proj-1",
      referenceNumber: 1004,
      title: "Fence stain",
      status: "COMPLETED",
    },
  ],
  estimates: [
    {
      estimateId: "est-1",
      projectId: "proj-1",
      referenceNumber: 1004,
      title: "Fence stain",
      status: "VIEWED",
      totalCents: 25000,
    },
  ],
  payments: [
    {
      paymentId: "pay-1",
      kind: "activation",
      amountCents: 999,
      status: "CONSUMED",
      livemode: true,
      needsRefund: false,
      refundReason: null,
      referenceNumber: null,
    },
    {
      paymentId: "pay-2",
      kind: "connect",
      amountCents: 499,
      status: "PAID",
      livemode: true,
      needsRefund: false,
      refundReason: null,
      referenceNumber: 1004,
    },
  ],
};

function renderContractors(entry: string) {
  return render(
    <MemoryRouter initialEntries={[entry]}>
      <Routes>
        <Route path="/app/admin/contractors" element={<ContractorsLayout />}>
          <Route index element={null} />
          <Route path=":contractorProfileId" element={<ContractorDetailPage />} />
        </Route>
      </Routes>
    </MemoryRouter>,
  );
}

describe("contractors directory", () => {
  beforeEach(() => {
    fetchContractors.mockReset();
    fetchContractor.mockReset();
    fetchContractors.mockResolvedValue({ rows: [row], total: 1 });
    fetchContractor.mockResolvedValue(detail);
  });

  it("shows the business name and hides write actions on a phone", async () => {
    mockAdminViewport(390);
    const user = userEvent.setup();
    renderContractors("/app/admin/contractors");
    expect(await screen.findByRole("link", { name: /Plymate Example/ })).toBeInTheDocument();
    expect(screen.getByText(/TV Mounting/)).toBeInTheDocument();
    expect(screen.getByText(/5.0 from 1 reviews/)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /suspend|restore|refund|mark paid/i })).not.toBeInTheDocument();
    await user.click(screen.getByRole("link", { name: /Plymate Example/ }));
    expect(await screen.findByRole("heading", { name: "Plymate Example" })).toBeInTheDocument();
    expect(screen.getByText(/\$9\.99/)).toBeInTheDocument();
    expect(screen.getByText(/\$4\.99/)).toBeInTheDocument();
    expect(screen.getByText(/\$250\.00/)).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: /Plymate Example/ })).not.toBeInTheDocument();
  });

  it("keeps the list beside the detail at 1280px", async () => {
    mockAdminViewport(1280);
    renderContractors("/app/admin/contractors/cp-1");
    expect(await screen.findByRole("heading", { name: "Plymate Example" })).toBeInTheDocument();
    expect(screen.getByRole("region", { name: "Contractors" })).toBeInTheDocument();
    expect(screen.getByRole("region", { name: "Contractor" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Plymate Example/ })).toBeInTheDocument();
  });
});