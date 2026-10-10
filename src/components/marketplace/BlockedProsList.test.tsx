import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { BlockedProsList } from "./BlockedProsList";

const listMyContractorBlocks = vi.fn();
const unblockContractorForCustomer = vi.fn();

vi.mock("../../lib/marketplace/api", () => ({
  listMyContractorBlocks: () => listMyContractorBlocks(),
  unblockContractorForCustomer: (id: string) => unblockContractorForCustomer(id),
}));

const hidden = {
  id: "block-1",
  contractor_profile_id: "pro-hidden",
  display_label: "Approved Plumbing Pro",
  uses_business_name: false,
  reason: "CUSTOMER_REQUEST",
  created_at: "2026-10-02T12:00:00.000Z",
  business_name: "Hidden Plumbing LLC",
};

describe("Blocked pros list", () => {
  beforeEach(() => {
    listMyContractorBlocks.mockReset();
    unblockContractorForCustomer.mockReset();
    listMyContractorBlocks.mockResolvedValue([hidden]);
    unblockContractorForCustomer.mockResolvedValue({ blocked: false, removed: true });
  });

  it("shows the neutral label and unblocks after confirmation", async () => {
    const user = userEvent.setup();
    render(<BlockedProsList />);

    expect(await screen.findByText("Approved Plumbing Pro")).toBeInTheDocument();
    expect(screen.getByText("You asked not to be matched")).toBeInTheDocument();
    expect(screen.queryByText("Hidden Plumbing LLC")).not.toBeInTheDocument();
    expect(screen.queryByText(/business_name/)).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Unblock" }));
    expect(screen.getByRole("dialog", { name: "Unblock this pro?" })).toBeInTheDocument();
    expect(unblockContractorForCustomer).not.toHaveBeenCalled();

    listMyContractorBlocks.mockResolvedValueOnce([]);
    const dialog = screen.getByRole("dialog", { name: "Unblock this pro?" });
    await user.click(within(dialog).getByRole("button", { name: "Unblock" }));

    expect(unblockContractorForCustomer).toHaveBeenCalledWith("pro-hidden");
    expect(await screen.findByText("You have not blocked any pros.")).toBeInTheDocument();
    expect(screen.getByText("Approved Plumbing Pro can be offered your future projects.")).toBeInTheDocument();
  });
});
