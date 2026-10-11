import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { AuthContext } from "../lib/auth/AuthContext";
import { authValue, signedInAuth } from "../lib/auth/authFixture";
import {
  PLATFORM_REVIEWS_ACTIVATION_REQUIRED,
  PLATFORM_REVIEWS_PENDING_SUCCESS,
} from "../lib/marketplace/platformReviews";
import { ReviewsPage } from "./ReviewsPage";

const fetchApprovedPlatformReviews = vi.fn();
const fetchOwnPlatformReview = vi.fn();
const submitPlatformReview = vi.fn();

vi.mock("../lib/marketplace/platformReviewsApi", () => ({
  fetchApprovedPlatformReviews: (...args: unknown[]) => fetchApprovedPlatformReviews(...args),
  fetchOwnPlatformReview: (...args: unknown[]) => fetchOwnPlatformReview(...args),
  submitPlatformReview: (...args: unknown[]) => submitPlatformReview(...args),
}));

vi.mock("../lib/supabase/config", () => ({
  isSupabaseConfigured: () => true,
}));

function renderPage(auth = authValue()) {
  return render(
    <MemoryRouter>
      <AuthContext.Provider value={auth}>
        <ReviewsPage />
      </AuthContext.Provider>
    </MemoryRouter>,
  );
}

describe("platform review submission", () => {
  beforeEach(() => {
    fetchApprovedPlatformReviews.mockReset();
    fetchOwnPlatformReview.mockReset();
    submitPlatformReview.mockReset();
    fetchApprovedPlatformReviews.mockResolvedValue([
      {
        id: "public-1",
        display_name: "Existing",
        city: "Conroe",
        rating: 5,
        body: "This approved review was already on the site.",
        created_at: "2026-09-01T00:00:00.000Z",
      },
    ]);
    fetchOwnPlatformReview.mockResolvedValue(null);
  });

  it("asks an unpaid signed-in account to activate instead of showing the form", async () => {
    renderPage(signedInAuth("CONTRACTOR", { signup_fee_status: "UNPAID" }));
    expect(await screen.findByText(PLATFORM_REVIEWS_ACTIVATION_REQUIRED)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Submit review" })).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Activate account" })).toHaveAttribute("href", "/account/activate");
    expect(await screen.findByText("This approved review was already on the site.")).toBeInTheDocument();
  });

  it("submits an activated review as pending and does not add it to the public list", async () => {
    const user = userEvent.setup();
    submitPlatformReview.mockResolvedValue({
      id: "new-1",
      user_id: "user-1",
      display_name: "Pat Lee",
      city: "Conroe",
      rating: 5,
      body: "Posting a project and comparing estimates was straightforward.",
      status: "PENDING",
      created_at: "2026-10-11T00:00:00.000Z",
    });
    renderPage(signedInAuth("CUSTOMER", { signup_fee_status: "NOT_REQUIRED" }));
    expect(await screen.findByDisplayValue("Pat Lee")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Submit review" })).toBeInTheDocument();
    await user.type(
      screen.getByRole("textbox", { name: /Your review/ }),
      "Posting a project and comparing estimates was straightforward.",
    );
    await user.click(screen.getByRole("button", { name: "Submit review" }));
    expect(submitPlatformReview).toHaveBeenCalledWith(
      expect.objectContaining({ viewerId: "user-1", signupFeeStatus: "NOT_REQUIRED" }),
    );
    expect(await screen.findByText(PLATFORM_REVIEWS_PENDING_SUCCESS)).toBeInTheDocument();
    expect(screen.queryByText("Posting a project and comparing estimates was straightforward.")).not.toBeInTheDocument();
    expect(screen.getByText("This approved review was already on the site.")).toBeInTheDocument();
  });

  it("stacks the submit action within a phone-width column", async () => {
    renderPage(signedInAuth("CUSTOMER", { signup_fee_status: "PAID" }));
    const button = await screen.findByRole("button", { name: "Submit review" });
    expect(button.className).toMatch(/w-full/);
    expect(button.className).toMatch(/min-h-11/);
  });
});
