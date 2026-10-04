import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";
import { PublicReviewSection } from "../../features/browse/PublicReviewSection";
import { ReviewedContractorCardView } from "../../features/browse/ReviewedContractorsPreview";
import type { ReviewedContractorCard } from "../../lib/marketplace/reviewedContractorsApi";
import { HomePlatformReviews } from "../../features/home/PlatformReviews";
import { ContractorDecisionRating } from "./ContractorDecisionRating";
import { ContractorReviewDashboard } from "../../pages/app/pro/ProReviewsPage";
import { AdminContractorReviewQueue } from "../../pages/app/admin/AdminContractorReviewsPage";

vi.mock("../../lib/supabase/config", () => ({
  isSupabaseConfigured: () => true,
}));

vi.mock("../../lib/marketplace/platformReviewsApi", () => ({
  fetchApprovedPlatformReviews: vi.fn().mockResolvedValue([]),
}));

const card: ReviewedContractorCard = {
  id: "pro-1",
  displayLabel: "Approved Handyman Pro",
  photoInitials: "HA",
  categories: ["Handyman"],
  serviceArea: "Local service area",
  yearsExperience: 4,
  ratingAverage: 4.5,
  ratingCount: 2,
  badges: [],
  shortDescription: "Indoor repairs.",
  reviews: [
    {
      id: "r1",
      rating: 5,
      body: "Finished the sticky door.",
      category: "Handyman",
      createdAt: "2026-09-02T12:00:00.000Z",
      verified: true,
      homeownerDisplay: "M.",
      responseBody: "Glad it latches now.",
      responseUpdatedAt: "2026-09-03T12:00:00.000Z",
    },
    {
      id: "r2",
      rating: 4,
      body: "Careful with the trim.",
      verified: true,
      homeownerDisplay: "Homeowner",
    },
  ],
};

describe("public and decision ratings", () => {
  it("links Find a Pro stars to the profile review section", () => {
    render(
      <MemoryRouter>
        <ReviewedContractorCardView card={card} />
      </MemoryRouter>,
    );
    const stars = screen.getByRole("link", { name: /4\.5 · 2 verified PPP reviews/i });
    expect(stars).toHaveAttribute("href", "/find-a-pro/pro-1#reviews");
    expect(screen.queryByText(/license reviewed/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/★ 5\.0 ·/)).not.toBeInTheDocument();
  });

  it("shows price-adjacent rating copy and keeps compare progress by opening a new tab", () => {
    render(
      <MemoryRouter>
        <ContractorDecisionRating average={4.5} count={2} contractorId="pro-1" />
      </MemoryRouter>,
    );
    const link = screen.getByRole("link", { name: /4\.5 · 2 verified PPP reviews/i });
    expect(link).toHaveAttribute("target", "_blank");
    expect(link).toHaveAttribute("href", "/find-a-pro/pro-1#reviews");
  });

  it("uses honest zero-review copy", () => {
    render(
      <MemoryRouter>
        <ContractorDecisionRating average={5} count={0} contractorId="pro-1" />
      </MemoryRouter>,
    );
    expect(screen.getByText("No reviews yet")).toBeInTheDocument();
    expect(screen.getByText("New on Priority Property Pros.")).toBeInTheDocument();
    expect(screen.queryByRole("link")).not.toBeInTheDocument();
    expect(screen.queryByText(/5\.0/)).not.toBeInTheDocument();
  });

  it("shows a profile summary, distribution, list, and response", () => {
    render(<PublicReviewSection reviews={card.reviews} average={4.5} count={2} />);
    expect(screen.getByRole("heading", { name: "Reviews" })).toHaveAttribute("id", "contractor-reviews-heading");
    expect(document.getElementById("reviews")).toBeTruthy();
    expect(screen.getByText(/5 stars, 1 review/i)).toBeInTheDocument();
    expect(screen.getByText(/4 stars, 1 review/i)).toBeInTheDocument();
    expect(screen.getAllByText("Verified PPP project").length).toBeGreaterThan(0);
    expect(screen.getByText(/M\. · Handyman/)).toBeInTheDocument();
    expect(screen.getByText("Glad it latches now.")).toBeInTheDocument();
    expect(screen.queryByText(/@/)).not.toBeInTheDocument();
  });

  it("hides the homepage recent reviews block when nothing is published", async () => {
    render(
      <MemoryRouter>
        <HomePlatformReviews />
      </MemoryRouter>,
    );
    await waitFor(() => {
      expect(screen.queryByRole("heading", { name: /what people say/i })).not.toBeInTheDocument();
    });
    expect(screen.queryByText(/be the first to review/i)).not.toBeInTheDocument();
  });
});

describe("contractor and admin review controls", () => {
  it("lets a contractor respond and report without editing or deleting the review", async () => {
    const user = userEvent.setup();
    const onRespond = vi.fn().mockResolvedValue(undefined);
    const onReport = vi.fn().mockResolvedValue(undefined);
    render(
      <ContractorReviewDashboard
        onRespond={onRespond}
        onReport={onReport}
        reputation={{
          ratingAverage: 5,
          ratingCount: 1,
          verifiedCount: 1,
          reviews: [
            {
              id: "r1",
              rating: 5,
              body: "Finished the sticky door cleanly.",
              category: "Handyman",
              createdAt: "2026-09-02T12:00:00.000Z",
              homeownerDisplay: "M.",
              reviewClass: "VERIFIED_PPP_PROJECT",
              moderationStatus: "PUBLISHED",
              verified: true,
              responseBody: null,
              responseCreatedAt: null,
              responseUpdatedAt: null,
              reportedByMe: false,
            },
          ],
        }}
      />,
    );
    expect(screen.queryByRole("button", { name: /delete/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /hide/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /verify/i })).not.toBeInTheDocument();
    expect(screen.queryByLabelText(/edit stars/i)).not.toBeInTheDocument();
    await user.type(screen.getByLabelText(/your response/i), "Thanks for trusting the work.");
    await user.click(screen.getByRole("button", { name: /post response/i }));
    expect(onRespond).toHaveBeenCalledWith("r1", "Thanks for trusting the work.");
    await user.click(screen.getByRole("button", { name: /^report$/i }));
    await user.selectOptions(screen.getByLabelText(/reason/i), "harassment");
    await user.click(screen.getByRole("button", { name: /send report/i }));
    expect(onReport).toHaveBeenCalledWith("r1", "harassment", "");
  });

  it("offers admin keep, hide, restore, and remove without a create-review control", () => {
    const onModerate = vi.fn();
    render(
      <AdminContractorReviewQueue
        busyId={null}
        onModerate={onModerate}
        reviews={[
          {
            id: "r1",
            rating: 2,
            body: "The visit was rushed.",
            category: "Handyman",
            createdAt: "2026-09-02T12:00:00.000Z",
            homeownerDisplay: "Homeowner",
            reviewClass: "VERIFIED_PPP_PROJECT",
            moderationStatus: "PUBLISHED",
            verified: true,
            responseBody: null,
            responseCreatedAt: null,
            responseUpdatedAt: null,
            reportedByMe: false,
            contractorProfileId: "pro-1",
            displayLabel: "Approved Handyman Pro",
            reports: [{ id: "rep-1", reason: "spam", note: null, createdAt: null }],
            events: [],
          },
        ]}
      />,
    );
    expect(screen.getByRole("button", { name: /keep published/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /^hide$/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /restore/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /remove for policy/i })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /create review|mark verified|add verified/i })).not.toBeInTheDocument();
    expect(screen.getByText(/report: spam/i)).toBeInTheDocument();
  });
});
