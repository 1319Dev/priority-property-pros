import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  BLOCK_CONTRACTOR_BODY,
  BLOCK_CONTRACTOR_BUTTON,
  BLOCK_CONTRACTOR_DONE,
  BLOCK_CONTRACTOR_TITLE,
  BlockContractorControl,
} from "./BlockContractorControl";

const blockContractorForCustomer = vi.fn();

vi.mock("../../lib/marketplace/api", () => ({
  blockContractorForCustomer: (...args: unknown[]) => blockContractorForCustomer(...args),
}));

describe("Block contractor control", () => {
  beforeEach(() => {
    blockContractorForCustomer.mockReset();
    blockContractorForCustomer.mockResolvedValue({ blocked: true });
  });

  it("confirms before blocking and keeps the success on the page", async () => {
    const user = userEvent.setup();
    const onBlocked = vi.fn();
    render(
      <BlockContractorControl contractorProfileId="pro-1" bookingId="book-1" onBlocked={onBlocked} />,
    );

    await user.click(screen.getByRole("button", { name: BLOCK_CONTRACTOR_BUTTON }));
    expect(screen.getByRole("dialog", { name: BLOCK_CONTRACTOR_TITLE })).toBeInTheDocument();
    expect(screen.getByText(BLOCK_CONTRACTOR_BODY)).toBeInTheDocument();
    expect(blockContractorForCustomer).not.toHaveBeenCalled();

    await user.click(screen.getByRole("button", { name: "Don't match again" }));

    expect(blockContractorForCustomer).toHaveBeenCalledWith({
      contractorProfileId: "pro-1",
      bookingId: "book-1",
      estimateId: null,
    });
    expect(await screen.findByText(BLOCK_CONTRACTOR_DONE)).toBeInTheDocument();
    expect(onBlocked).toHaveBeenCalledOnce();
    expect(screen.queryByRole("dialog", { name: BLOCK_CONTRACTOR_TITLE })).not.toBeInTheDocument();
  });

  it("leaves the pro unblocked when the customer cancels", async () => {
    const user = userEvent.setup();
    render(<BlockContractorControl contractorProfileId="pro-1" estimateId="est-1" />);

    await user.click(screen.getByRole("button", { name: BLOCK_CONTRACTOR_BUTTON }));
    await user.click(screen.getByRole("button", { name: "Keep matching" }));

    expect(blockContractorForCustomer).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: BLOCK_CONTRACTOR_BUTTON })).toBeInTheDocument();
  });
});
