import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it } from "vitest";
import { ConnectConfirmDialog } from "../../components/marketplace/ConnectConfirm";
import { ContractorConnectionCta } from "../../components/marketplace/ContractorConnectionCta";
import { PricingPage } from "../../pages/PricingPage";
import { ConnectionCheckoutReturnPage } from "../../pages/app/pro/ConnectionCheckoutReturnPage";
import {
  CONNECTION_FEE,
  CONNECTION_FEE_PER_LABEL,
  PRICING_PAGE_TITLE,
  PRICING_PRIMARY,
  SIGNUP_FEE_ONE_TIME_LABEL,
} from "../../data/pricing";
import { CHECKOUT_PENDING_COPY, CONNECTED_BODY, CONNECTED_LABEL } from "./connectionLifecycle";

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
    expect(screen.getByText(/contact stays locked until the server verifies/i)).toBeInTheDocument();
    expect(screen.getAllByText(/\$4\.99 Connection Fee is non-refundable/i).length).toBeGreaterThan(0);
    expect(screen.getByText(/are the \$9\.99 activation fee and \$4\.99 connection fee refundable/i)).toBeInTheDocument();
  });

  it("shows Connect, Checkout pending, and Connected states at ~390px", () => {
    const { rerender } = render(
      <div className="mx-auto w-[390px] max-w-[390px]">
        <ContractorConnectionCta state="connect" onConnect={() => undefined} />
      </div>,
    );
    expect(screen.getByRole("button", { name: /Connect — \$4\.99/i })).toBeInTheDocument();

    rerender(
      <div className="mx-auto w-[390px] max-w-[390px]">
        <ContractorConnectionCta state="checkout_pending" onConnect={() => undefined} />
      </div>,
    );
    expect(screen.getByText(/Checkout in progress/i)).toBeInTheDocument();
    expect(screen.getByText(CHECKOUT_PENDING_COPY)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Connect — \$4\.99/i })).toBeInTheDocument();

    rerender(
      <div className="mx-auto w-[390px] max-w-[390px]">
        <ContractorConnectionCta state="connected" onConnect={() => undefined} />
      </div>,
    );
    expect(screen.getByText(CONNECTED_LABEL)).toBeInTheDocument();
    expect(screen.getByText(CONNECTED_BODY)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Connect — \$4\.99/i })).not.toBeInTheDocument();
  });

  it("keeps contact locked on the checkout return page without a session_id", async () => {
    render(
      <MemoryRouter initialEntries={["/app/pro/connections/return"]}>
        <div className="mx-auto w-[390px] max-w-[390px]">
          <ConnectionCheckoutReturnPage />
        </div>
      </MemoryRouter>,
    );
    expect(await screen.findByRole("heading", { name: /Contact still locked/i })).toBeInTheDocument();
    expect(screen.getAllByText(/\$4\.99 Connection Fee is non-refundable/i).length).toBeGreaterThan(0);
    expect(screen.queryByText(/Edge Function returned a non-2xx status code/i)).not.toBeInTheDocument();
  });
});
