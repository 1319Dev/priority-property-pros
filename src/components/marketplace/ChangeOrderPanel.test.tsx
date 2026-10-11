import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import {
  CHANGE_ORDER_ACK_ERROR,
  CHANGE_ORDER_AMOUNT_ERROR,
  CHANGE_ORDER_APPROVE_ERROR,
  CHANGE_ORDER_DECREASE_ERROR,
  CHANGE_ORDER_DESCRIPTION_ERROR,
  CHANGE_ORDER_REJECT_ERROR,
  CHANGE_ORDER_SAVE_ERROR,
} from "../../lib/marketplace/changeOrders";
import type { ChangeOrder } from "../../lib/marketplace/types";
import { ChangeOrderPanel } from "./ChangeOrderPanel";

function order(overrides: Partial<ChangeOrder> = {}): ChangeOrder {
  return {
    id: "co-1",
    booking_id: "b-1",
    created_by: "user-1",
    created_by_role: "CONTRACTOR",
    description: "Add a gate",
    amount_delta_cents: 2500,
    status: "PROPOSED",
    customer_approved_at: null,
    customer_approved_by: null,
    contractor_acked_at: null,
    contractor_acked_by: null,
    decided_at: null,
    created_at: "2026-10-08T00:00:00Z",
    updated_at: "2026-10-08T00:00:00Z",
    ...overrides,
  };
}

describe("ChangeOrderPanel", () => {
  it("blocks an empty or zero amount and a short description without calling the server", async () => {
    const onPropose = vi.fn();
    const user = userEvent.setup();
    render(<ChangeOrderPanel role="customer" orders={[]} onPropose={onPropose} onRespond={vi.fn()} />);

    await user.click(screen.getByRole("button", { name: /propose a change/i }));
    expect(onPropose).not.toHaveBeenCalled();
    expect(screen.getByText(CHANGE_ORDER_AMOUNT_ERROR)).toBeInTheDocument();
    expect(screen.getByText(CHANGE_ORDER_DESCRIPTION_ERROR)).toBeInTheDocument();

    await user.type(screen.getByRole("textbox", { name: /change amount/i }), "0");
    await user.type(screen.getByRole("textbox", { name: /what changed/i }), "Ok");
    await user.click(screen.getByRole("button", { name: /propose a change/i }));
    expect(onPropose).not.toHaveBeenCalled();
    expect(screen.getByText(CHANGE_ORDER_AMOUNT_ERROR)).toBeInTheDocument();
    expect(screen.getByText(CHANGE_ORDER_DESCRIPTION_ERROR)).toBeInTheDocument();
  });

  it("submits a real amount and clears the error banner after a successful retry", async () => {
    const onPropose = vi.fn().mockRejectedValueOnce(new Error("describe the change")).mockResolvedValueOnce(undefined);
    const user = userEvent.setup();
    render(<ChangeOrderPanel role="contractor" orders={[]} onPropose={onPropose} onRespond={vi.fn()} />);

    await user.type(screen.getByRole("textbox", { name: /change amount/i }), "12.00");
    await user.type(screen.getByRole("textbox", { name: /what changed/i }), "Add two pickets");
    await user.click(screen.getByRole("button", { name: /propose a change/i }));
    expect(await screen.findByRole("alert")).toHaveTextContent(CHANGE_ORDER_SAVE_ERROR);
    expect(screen.queryByText(/describe the change/i)).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /propose a change/i }));
    await waitFor(() => {
      expect(onPropose).toHaveBeenLastCalledWith("Add two pickets", 1200);
      expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    });
  });

  it("shows a friendly message for approve, decline, and acknowledge failures and clears it on success", async () => {
    const user = userEvent.setup();
    const onRespond = vi.fn().mockRejectedValueOnce(new Error("42804")).mockResolvedValueOnce(undefined);
    const { rerender } = render(
      <ChangeOrderPanel role="customer" orders={[order()]} onPropose={vi.fn()} onRespond={onRespond} />,
    );

    await user.click(screen.getByRole("button", { name: "Approve" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(CHANGE_ORDER_APPROVE_ERROR);
    expect(screen.queryByText("42804")).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Approve" }));
    await waitFor(() => {
      expect(onRespond).toHaveBeenLastCalledWith("co-1", true);
      expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    });

    onRespond.mockRejectedValueOnce(new Error("nope"));
    await user.click(screen.getByRole("button", { name: "Decline" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(CHANGE_ORDER_REJECT_ERROR);

    rerender(
      <ChangeOrderPanel
        role="contractor"
        orders={[order({ status: "CUSTOMER_APPROVED", customer_approved_at: "2026-10-08T00:00:00Z" })]}
        onPropose={vi.fn()}
        onRespond={onRespond}
      />,
    );
    onRespond.mockRejectedValueOnce(new Error("boom"));
    await user.click(screen.getByRole("button", { name: "Acknowledge" }));
    expect(await screen.findByText(CHANGE_ORDER_ACK_ERROR)).toBeInTheDocument();
  });

  it("lets the contractor decline a customer proposal and ignores the customer's waiting row", async () => {
    const user = userEvent.setup();
    const onRespond = vi.fn().mockResolvedValue(undefined);
    const { rerender } = render(
      <ChangeOrderPanel
        role="contractor"
        orders={[order({ status: "CUSTOMER_APPROVED", created_by_role: "CUSTOMER", customer_approved_at: "2026-10-08T00:00:00Z" })]}
        onPropose={vi.fn()}
        onRespond={onRespond}
      />,
    );
    expect(screen.getByText(/Needs your OK/)).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Decline" }));
    expect(onRespond).toHaveBeenCalledWith("co-1", false);

    rerender(
      <ChangeOrderPanel
        role="contractor"
        orders={[order({ status: "PROPOSED" })]}
        onPropose={vi.fn()}
        onRespond={onRespond}
      />,
    );
    expect(screen.getByText(/Waiting for customer/)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Decline" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Acknowledge" })).not.toBeInTheDocument();
  });

  it("blocks a decrease larger than the job total before calling the server", async () => {
    const onPropose = vi.fn();
    const user = userEvent.setup();
    render(
      <ChangeOrderPanel role="contractor" orders={[]} jobTotalCents={4000} onPropose={onPropose} onRespond={vi.fn()} />,
    );
    await user.type(screen.getByRole("textbox", { name: /change amount/i }), "-50");
    await user.type(screen.getByRole("textbox", { name: /what changed/i }), "Remove the whole fence");
    await user.click(screen.getByRole("button", { name: /propose a change/i }));
    expect(onPropose).not.toHaveBeenCalled();
    expect(screen.getByText(CHANGE_ORDER_DECREASE_ERROR)).toBeInTheDocument();
  });
});
