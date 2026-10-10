import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { AdminApprovalsPage } from "./AdminApprovalsPages";
import { PortfolioPhotoReviewList, PortfolioPhotoReviewPanel } from "./PortfolioPhotoReview";
import * as approvalsApi from "../../../lib/admin/approvalsApi";
import * as marketplaceApi from "../../../lib/marketplace/api";

vi.mock("../../../lib/admin/approvalsApi", () => ({
  listContractorApprovals: vi.fn(async () => []),
  adminListPortfolioReviewQueue: vi.fn(),
  adminSetPortfolioPrivacy: vi.fn(),
}));

vi.mock("../../../lib/marketplace/api", () => ({
  signedContractorDocUrl: vi.fn(),
}));

const photo = {
  id: "photo-1",
  contractor_profile_id: "cp-1",
  contractor_label: "Northside Fence Co.",
  title: "Cedar fence repair",
  description: "Replaced a broken panel on a side yard.",
  storage_path: "user/portfolio/cedar.jpg",
  created_at: "2026-10-01T15:00:00.000Z",
};

describe("Photo review", () => {
  beforeEach(() => {
    vi.mocked(approvalsApi.adminListPortfolioReviewQueue).mockReset();
    vi.mocked(approvalsApi.adminSetPortfolioPrivacy).mockReset();
    vi.mocked(marketplaceApi.signedContractorDocUrl).mockReset();
    vi.mocked(approvalsApi.adminListPortfolioReviewQueue).mockResolvedValue([photo]);
    vi.mocked(approvalsApi.adminSetPortfolioPrivacy).mockResolvedValue(undefined);
    vi.mocked(marketplaceApi.signedContractorDocUrl).mockResolvedValue("https://example.com/cedar.jpg");
  });

  it("shows the signed image, caption, and contractor", async () => {
    render(<PortfolioPhotoReviewPanel />);
    expect(await screen.findByRole("heading", { name: "Northside Fence Co." })).toBeInTheDocument();
    expect(screen.getByText("Cedar fence repair")).toBeInTheDocument();
    expect(screen.getByText("Replaced a broken panel on a side yard.")).toBeInTheDocument();
    expect(screen.getByRole("img", { name: "Cedar fence repair" })).toHaveAttribute("src", "https://example.com/cedar.jpg");
    expect(screen.getByText(/Oct 1, 2026/i)).toBeInTheDocument();
  });

  it("shows a placeholder when the signed URL is missing", async () => {
    vi.mocked(marketplaceApi.signedContractorDocUrl).mockResolvedValue(null);
    render(<PortfolioPhotoReviewPanel />);
    expect(await screen.findByText("Photo unavailable")).toBeInTheDocument();
    expect(screen.queryByRole("img")).not.toBeInTheDocument();
  });

  it("replaces a broken thumbnail with the placeholder", () => {
    render(
      <PortfolioPhotoReviewList
        items={[{ ...photo, imageUrl: "https://example.com/missing.jpg" }]}
        onApprove={() => undefined}
        onHide={() => undefined}
      />,
    );
    fireEvent.error(screen.getByRole("img", { name: "Cedar fence repair" }));
    expect(screen.getByText("Photo unavailable")).toBeInTheDocument();
    expect(screen.queryByRole("img", { name: "Cedar fence repair" })).not.toBeInTheDocument();
  });

  it("approves and hides from the list immediately", async () => {
    const user = userEvent.setup();
    const onApprove = vi.fn();
    const onHide = vi.fn();
    const { rerender } = render(
      <PortfolioPhotoReviewList
        items={[{ ...photo, imageUrl: "https://example.com/cedar.jpg" }]}
        onApprove={onApprove}
        onHide={onHide}
      />,
    );
    await user.click(screen.getByRole("button", { name: /approve cedar fence repair/i }));
    expect(onApprove).toHaveBeenCalledWith("photo-1");
    rerender(
      <PortfolioPhotoReviewList items={[]} onApprove={onApprove} onHide={onHide} />,
    );
    expect(screen.getByText(/no photos waiting for review/i)).toBeInTheDocument();

    render(<PortfolioPhotoReviewPanel />);
    await user.click(await screen.findByRole("button", { name: /hide cedar fence repair/i }));
    expect(approvalsApi.adminSetPortfolioPrivacy).toHaveBeenCalledWith("photo-1", "PRIVATE");
    await waitFor(() => {
      expect(screen.queryByRole("heading", { name: "Northside Fence Co." })).not.toBeInTheDocument();
    });
  });

  it("loads the queue, signs the thumbnail, and drops the card on approve or hide", async () => {
    const user = userEvent.setup();
    const { unmount } = render(<PortfolioPhotoReviewPanel />);
    expect(await screen.findByRole("img", { name: "Cedar fence repair" })).toHaveAttribute(
      "src",
      "https://example.com/cedar.jpg",
    );
    expect(approvalsApi.adminListPortfolioReviewQueue).toHaveBeenCalledTimes(1);
    expect(marketplaceApi.signedContractorDocUrl).toHaveBeenCalledWith(photo.storage_path);
    await user.click(screen.getByRole("button", { name: /approve cedar fence repair/i }));
    expect(approvalsApi.adminSetPortfolioPrivacy).toHaveBeenCalledWith("photo-1", "PUBLIC_SAFE");
    await waitFor(() => {
      expect(screen.getByText(/no photos waiting for review/i)).toBeInTheDocument();
    });
    unmount();

    vi.mocked(approvalsApi.adminSetPortfolioPrivacy).mockClear();
    render(<PortfolioPhotoReviewPanel />);
    await user.click(await screen.findByRole("button", { name: /hide cedar fence repair/i }));
    expect(approvalsApi.adminSetPortfolioPrivacy).toHaveBeenCalledWith("photo-1", "PRIVATE");
    await waitFor(() => {
      expect(screen.getByText(/no photos waiting for review/i)).toBeInTheDocument();
    });
  });

  it("keeps the photo and shows a friendly message when the privacy RPC fails", async () => {
    const user = userEvent.setup();
    vi.mocked(approvalsApi.adminSetPortfolioPrivacy).mockRejectedValue(new Error("Could not update this photo."));
    render(<PortfolioPhotoReviewPanel />);
    await user.click(await screen.findByRole("button", { name: /approve cedar fence repair/i }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Could not update this photo.");
    expect(screen.getByRole("heading", { name: "Northside Fence Co." })).toBeInTheDocument();
  });

  it("shows an error state when the queue RPC is missing and leaves approvals usable", async () => {
    const user = userEvent.setup();
    vi.mocked(approvalsApi.adminListPortfolioReviewQueue).mockRejectedValue(
      new Error("Could not load photos waiting for review."),
    );
    render(
      <MemoryRouter>
        <AdminApprovalsPage />
      </MemoryRouter>,
    );
    expect(await screen.findByRole("heading", { name: "Contractor approvals" })).toBeInTheDocument();
    await user.click(screen.getByRole("tab", { name: /photo review/i }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Could not load photos waiting for review.");
    expect(screen.getByRole("heading", { name: "Contractor approvals" })).toBeInTheDocument();
    await user.click(screen.getByRole("tab", { name: "Contractors" }));
    expect(await screen.findByText("No pending applications")).toBeInTheDocument();
  });

  it("opens Photo review from contractor approvals and approves in place", async () => {
    const user = userEvent.setup();
    render(
      <MemoryRouter>
        <AdminApprovalsPage />
      </MemoryRouter>,
    );
    await user.click(await screen.findByRole("tab", { name: /photo review/i }));
    expect(await screen.findByRole("heading", { name: "Photo review" })).toBeInTheDocument();
    expect(screen.getByRole("img", { name: "Cedar fence repair" })).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: /approve cedar fence repair/i }));
    expect(approvalsApi.adminSetPortfolioPrivacy).toHaveBeenCalledWith("photo-1", "PUBLIC_SAFE");
    await waitFor(() => {
      expect(screen.getByText(/no photos waiting for review/i)).toBeInTheDocument();
    });
  });
});
