import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { REVIEWED_PROS_EMPTY_COMPACT, REVIEWED_PROS_EMPTY_TITLE } from "../../lib/marketplace/reviewedContractors";
import { loadReviewedContractors } from "../../lib/marketplace/reviewedContractorsApi";
import { HomeBrowsePreview } from "./BrowseVisuals";
import { ReviewedContractorsList } from "./ReviewedContractorsPreview";

vi.mock("../../lib/supabase/config", () => ({
  isSupabaseConfigured: () => true,
}));

vi.mock("../../lib/marketplace/reviewedContractorsApi", () => ({
  loadReviewedContractors: vi.fn(),
}));

const loadReviewed = vi.mocked(loadReviewedContractors);

function renderPreview() {
  return render(
    <MemoryRouter>
      <HomeBrowsePreview />
    </MemoryRouter>,
  );
}

describe("Reviewed contractors preview", () => {
  beforeEach(() => {
    loadReviewed.mockReset();
  });

  it("keeps the empty preview when the public fetch throws a raw TypeError", async () => {
    loadReviewed.mockRejectedValue(new TypeError("Failed to fetch"));

    renderPreview();

    expect(await screen.findByText(REVIEWED_PROS_EMPTY_TITLE)).toBeInTheDocument();
    expect(screen.getByText(REVIEWED_PROS_EMPTY_COMPACT)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /try again/i })).toBeInTheDocument();
    expect(screen.queryByText(/failed to fetch/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/typeerror/i)).not.toBeInTheDocument();
    expect(document.body.textContent).not.toMatch(/Sample contractors are not shown/i);
  });

  it("shows the existing empty preview without a retry when there are no publishable reviews", async () => {
    loadReviewed.mockResolvedValue([]);

    renderPreview();

    expect(await screen.findByText(REVIEWED_PROS_EMPTY_TITLE)).toBeInTheDocument();
    expect(screen.getByText(REVIEWED_PROS_EMPTY_COMPACT)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /try again/i })).not.toBeInTheDocument();
    expect(screen.queryByText(/failed to fetch/i)).not.toBeInTheDocument();
  });

  it("retries a failed load without rendering the exception", async () => {
    loadReviewed.mockRejectedValueOnce(new TypeError("Failed to fetch")).mockRejectedValueOnce(new TypeError("Failed to fetch")).mockResolvedValueOnce([]);
    const user = userEvent.setup();

    renderPreview();

    const retry = await screen.findByRole("button", { name: /try again/i });
    await user.click(retry);

    await waitFor(() => {
      expect(screen.queryByRole("button", { name: /try again/i })).not.toBeInTheDocument();
    });
    expect(screen.getByText(REVIEWED_PROS_EMPTY_TITLE)).toBeInTheDocument();
    expect(screen.queryByText(/failed to fetch/i)).not.toBeInTheDocument();
  });

  it("does not print a caller-supplied failure string", () => {
    render(
      <MemoryRouter>
        <ReviewedContractorsList
          cards={[]}
          failed
          loading={false}
          compactEmpty
          onRetry={() => undefined}
        />
      </MemoryRouter>,
    );

    expect(screen.getByText(REVIEWED_PROS_EMPTY_TITLE)).toBeInTheDocument();
    expect(screen.getByText(REVIEWED_PROS_EMPTY_COMPACT)).toBeInTheDocument();
    expect(screen.queryByText(/typeerror/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/failed to fetch/i)).not.toBeInTheDocument();
  });
});
