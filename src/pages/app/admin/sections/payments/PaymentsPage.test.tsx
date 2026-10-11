import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { mockAdminViewport } from "../../../../../test/adminViewport";
import type { PaymentRow, PaymentsSummary } from "../../../../../lib/admin/paymentsApi";
import { PaymentsPage } from "./PaymentsPage";

const fetchPayments = vi.fn();
const fetchPaymentsSummary = vi.fn();

vi.mock("../../../../../lib/admin/paymentsApi", async () => {
  const actual = await vi.importActual<typeof import("../../../../../lib/admin/paymentsApi")>("../../../../../lib/admin/paymentsApi");
  return {
    ...actual,
    fetchPayments: (...args: unknown[]) => fetchPayments(...args),
    fetchPaymentsSummary: (...args: unknown[]) => fetchPaymentsSummary(...args),
  };
});

const paid: PaymentRow = {
  paymentId: "pay-1",
  kind: "activation",
  amountCents: 999,
  status: "PAID",
  livemode: true,
  createdAt: "2026-10-04T18:00:00.000Z",
  fulfilledAt: null,
  needsRefund: true,
  refundReason: "duplicate",
  refundedCents: 0,
  profileId: "cust-1",
  partyName: "Owen Home",
  email: "owen@example.com",
  businessName: null,
  referenceNumber: null,
};

const failed: PaymentRow = {
  ...paid,
  paymentId: "pay-2",
  status: "FAILED",
  needsRefund: false,
  refundReason: null,
};

const connect: PaymentRow = {
  ...paid,
  paymentId: "pay-3",
  kind: "connect",
  amountCents: 499,
  status: "CONSUMED",
  needsRefund: false,
  refundReason: null,
  businessName: "Plymate Example",
  referenceNumber: 1004,
  livemode: false,
};

const money: PaymentsSummary = {
  grossCents: 2497,
  refundedCents: 0,
  netCents: 2497,
  failedCount: 1,
  needsRefundCount: 2,
  definition: "Net revenue is livemode activation and Connect payments in PAID or CONSUMED, minus completed refund amounts. A needs_refund flag is not a completed refund and is not subtracted.",
};

function renderPayments() {
  return render(
    <MemoryRouter>
      <PaymentsPage />
    </MemoryRouter>,
  );
}

describe("payments dashboard", () => {
  beforeEach(() => {
    fetchPayments.mockReset();
    fetchPaymentsSummary.mockReset();
    fetchPayments.mockResolvedValue({ rows: [paid, failed, connect], total: 3 });
    fetchPaymentsSummary.mockResolvedValue(money);
  });

  it("shows net revenue, a refunds column, and a failed filter on a phone", async () => {
    mockAdminViewport(390);
    const user = userEvent.setup();
    renderPayments();
    expect(await screen.findByRole("region", { name: "Net revenue" })).toBeInTheDocument();
    expect(screen.getAllByText(/\$24\.97/).length).toBeGreaterThan(0);
    expect(screen.getByText(/needs_refund flag is not a completed refund/)).toBeInTheDocument();
    expect(screen.getAllByText(/Refunds \$0\.00/).length).toBeGreaterThan(0);
    expect(screen.getByText(/Needs refund · duplicate/)).toBeInTheDocument();
    expect(screen.getByText(/Test mode/)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /mark paid/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /refund/i })).not.toBeInTheDocument();
    await user.click(screen.getByRole("checkbox", { name: "Failed payments" }));
    expect(fetchPayments).toHaveBeenLastCalledWith(expect.objectContaining({ failedOnly: true }));
  });

  it("keeps the net revenue definition visible at 1280px", async () => {
    mockAdminViewport(1280);
    renderPayments();
    expect(await screen.findByRole("heading", { name: "Payments" })).toBeInTheDocument();
    expect(screen.getByRole("region", { name: "Net revenue" })).toBeInTheDocument();
    expect(screen.getByText(/stored refunds \$0\.00/)).toBeInTheDocument();
    expect(screen.getByText("Card declines are not recorded. Expired checkouts are not failed payments.")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /refund/i })).not.toBeInTheDocument();
  });
});
