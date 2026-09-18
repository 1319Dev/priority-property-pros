import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it } from "vitest";
import { ConnectConfirmDialog } from "../../components/marketplace/ConnectConfirm";
import { PricingPage } from "../../pages/PricingPage";
import {
  CONNECTION_FEE,
  CONNECTION_FEE_PER_LABEL,
  PRICING_PAGE_TITLE,
  PRICING_PRIMARY,
  SIGNUP_FEE_ONE_TIME_LABEL,
} from "../../data/pricing";

describe("Connection marketplace mobile UI", () => {
  it("20. pricing and connect confirm are stacked and obvious at ~390px", () => {
    const { container } = render(
      <MemoryRouter>
        <div className="mx-auto w-[390px] max-w-[390px]">
          <PricingPage />
        </div>
      </MemoryRouter>,
    );
    expect(screen.getByRole("heading", { name: PRICING_PAGE_TITLE })).toBeInTheDocument();
    expect(screen.getAllByText(SIGNUP_FEE_ONE_TIME_LABEL).length).toBeGreaterThan(0);
    expect(screen.getAllByText(CONNECTION_FEE_PER_LABEL).length).toBeGreaterThan(0);
    expect(screen.getAllByText(CONNECTION_FEE).length).toBeGreaterThan(0);
    expect(screen.getAllByText(PRICING_PRIMARY).length).toBeGreaterThan(0);
    expect(container.querySelector(".flex.flex-col")).toBeTruthy();
    render(<ConnectConfirmDialog open busy={false} onConfirm={() => undefined} onClose={() => undefined} />);
    expect(screen.getByText(/Connect with this customer for \$4\.99/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Connect — \$4\.99/i })).toBeInTheDocument();
  });
});
