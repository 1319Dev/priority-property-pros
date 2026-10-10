import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ReactNode } from "react";
import { MemoryRouter } from "react-router-dom";
import { AuthContext } from "../../lib/auth/AuthContext";
import { authValue } from "../../lib/auth/authFixture";
import { describe, expect, it } from "vitest";
import {
  FIND_A_PRO_LAYOUT_CLASS,
  NEW_ON_PPP,
  NO_REVIEWS_YET,
  PORTFOLIO_EMPTY,
  publicDirectoryReviews,
  publicPortfolioItems,
  toFindAProCard,
  VERIFIED_PROJECT_LABEL,
} from "../../lib/marketplace/findAPro";
import { ContractorStorefront } from "./ContractorStorefront";
import { FindAProCardView, FindAProDirectory } from "./FindAProDirectory";

function card(overrides: Partial<Parameters<typeof toFindAProCard>[0]> = {}) {
  return toFindAProCard({
    id: "11111111-1111-4111-8111-111111111111",
    displayLabel: "Approved Fence Pro",
    categories: ["Fence Repair", "Gates"],
    serviceArea: "Houston",
    yearsExperience: 8,
    shortDescription: "Independent local fence contractor.",
    acceptingWork: true,
    portfolio: [],
    reviews: [],
    ...overrides,
  });
}

function renderCard(ui: ReactNode) {
  return render(
    <AuthContext.Provider value={authValue()}>
      <MemoryRouter>{ui}</MemoryRouter>
    </AuthContext.Provider>,
  );
}

const reviewed = card({
  id: "22222222-2222-4222-8222-222222222222",
  displayLabel: "Approved Handyman Pro",
  categories: ["Handyman"],
  serviceArea: "Austin",
  acceptingWork: false,
  portfolio: publicPortfolioItems([{ id: "p1", caption: "Reset a cedar panel", sort_order: 0 }]),
  reviews: publicDirectoryReviews([{ id: "r1", rating: 5, body: "Finished the indoor repair." }]),
});

describe("Find a Pro cards", () => {
  it("shows a zero-review contractor without stars", () => {
    renderCard(
      <div className="mx-auto w-[390px] max-w-[390px]">
        <FindAProCardView card={card()} />
      </div>,
    );
    expect(screen.getByRole("heading", { name: "Approved Fence Pro" })).toBeInTheDocument();
    expect(screen.getByText("Fence Repair")).toBeInTheDocument();
    expect(screen.getByText(/Gates/)).toBeInTheDocument();
    expect(screen.getByText("Houston Area")).toBeInTheDocument();
    expect(screen.getByText("8 years in business")).toBeInTheDocument();
    expect(screen.getByText("Accepting work")).toBeInTheDocument();
    expect(screen.getByText(NEW_ON_PPP)).toBeInTheDocument();
    expect(screen.getByText(NO_REVIEWS_YET)).toBeInTheDocument();
    expect(screen.getByText("No portfolio yet")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "View Profile" })).toHaveAttribute(
      "href",
      "/find-a-pro/11111111-1111-4111-8111-111111111111",
    );
    expect(screen.getByRole("link", { name: /post a project/i })).toHaveAttribute(
      "href",
      "/post-project?pro=11111111-1111-4111-8111-111111111111&trade=Fence+Repair",
    );
    expect(screen.queryByText(/★|0\.0/)).not.toBeInTheDocument();
    expect(document.body.innerHTML).not.toMatch(/tel:|mailto:|512-555|@example/i);
  });

  it("shows a reviewed contractor rating, count, and real portfolio caption", () => {
    renderCard(<FindAProCardView card={reviewed} />);
    expect(screen.getByText("5.0 ★ · 1 review")).toBeInTheDocument();
    expect(screen.getByText("Reset a cedar panel")).toBeInTheDocument();
    expect(screen.queryByText(NEW_ON_PPP)).not.toBeInTheDocument();
    expect(screen.getByText("Not accepting work")).toBeInTheDocument();
  });

  it("keeps the directory from using a horizontal overflow layout at 390px", () => {
    const { container } = renderCard(
      <div className="w-[390px] max-w-[390px]">
        <FindAProDirectory cards={[card(), reviewed]} loading={false} />
      </div>,
    );
    const layout = container.querySelector("article");
    expect(layout?.className).toMatch(/min-w-0/);
    expect(layout?.className).toMatch(/max-w-full/);
    expect(layout?.className).toContain(FIND_A_PRO_LAYOUT_CLASS);
    expect(container.querySelector("form")?.className).toMatch(/min-w-0/);
  });
});

describe("Contractor storefront", () => {
  it("shows an empty portfolio and empty reviews without Verified Project", () => {
    renderCard(<ContractorStorefront profile={{ ...card(), about: "Independent local fence contractor." }} />);
    expect(screen.getByRole("heading", { name: "Approved Fence Pro" })).toBeInTheDocument();
    expect(screen.getByText(PORTFOLIO_EMPTY)).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Reviews" }).parentElement).toHaveTextContent(NO_REVIEWS_YET);
    expect(screen.queryByText(VERIFIED_PROJECT_LABEL)).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: /invite|request estimate|call|email/i })).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: /post a project/i })).toHaveAttribute(
      "href",
      "/post-project?pro=11111111-1111-4111-8111-111111111111&trade=Fence+Repair",
    );
  });

  it("shows Verified Project only on a qualifying review and a real portfolio caption", () => {
    const qualifying = reviewed.reviews[0];
    renderCard(
      <ContractorStorefront
        profile={{
          ...reviewed,
          about: "Indoor repairs for property owners.",
          reviews: [
            { ...qualifying, verifiedProject: true },
            { id: "plain", rating: 4, body: "Helpful, but this row has no qualifying relationship.", verifiedProject: false },
          ],
        }}
      />,
    );
    expect(screen.getByText("Reset a cedar panel")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Portfolio" }).closest("section")?.querySelector("img")).toBeNull();
    expect(screen.getAllByText(VERIFIED_PROJECT_LABEL)).toHaveLength(1);
    expect(screen.getByText(/no qualifying relationship/i)).toBeInTheDocument();
  });

  it("filters the directory down to new contractors", async () => {
    const user = userEvent.setup();
    renderCard(<FindAProDirectory cards={[card(), reviewed]} loading={false} />);
    await user.selectOptions(screen.getByRole("combobox", { name: "Reviews" }), "new");
    expect(screen.getByRole("heading", { name: "Approved Fence Pro" })).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Approved Handyman Pro" })).not.toBeInTheDocument();
  });
});
