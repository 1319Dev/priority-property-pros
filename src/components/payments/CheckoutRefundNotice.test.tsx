import { render, screen, within } from "@testing-library/react";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";
import { AuthContext } from "../../lib/auth/AuthContext";
import { signedInAuth } from "../../lib/auth/authFixture";
import { ConnectConfirmDialog } from "../marketplace/ConnectConfirm";
import { ActivateAccountPage } from "../../pages/ActivateAccountPage";
import { CHECKOUT_REFUND_NOTICE_TEXT, CheckoutRefundNotice, REFUND_POLICY_PATH } from "./CheckoutRefundNotice";

vi.mock("../../lib/signupFee/api", () => ({
  startSignupFeeCheckout: vi.fn(),
  reconcileSignupFeeCheckout: vi.fn(),
}));

const FULL_NOTICE =
  "Fees are generally non-refundable once delivered, except duplicate or erroneous charges, refunds required by law, or approved exceptions. See Refund Policy.";

const srcRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

function noticeBefore(button: HTMLElement) {
  const notice = screen.getByTestId("checkout-refund-notice");
  // The notice must come right before the pay button in reading order.
  expect(notice.compareDocumentPosition(button) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  return notice;
}

describe("checkout refund notice", () => {
  it("shows the exact sentence with a Refund Policy link to /refunds", () => {
    render(<CheckoutRefundNotice />);
    const notice = screen.getByRole("note");
    expect(notice.textContent?.replace(/\s+/g, " ").trim()).toBe(FULL_NOTICE);
    expect(within(notice).getByRole("link", { name: "Refund Policy" })).toHaveAttribute("href", "/refunds");
    expect(REFUND_POLICY_PATH).toBe("/refunds");
    expect(CHECKOUT_REFUND_NOTICE_TEXT).toMatch(/duplicate or erroneous charges/);
  });

  it("sits directly above the $4.99 Connect button at phone width", () => {
    render(
      <div className="mx-auto w-[390px] max-w-[390px]">
        <ConnectConfirmDialog open busy={false} onConfirm={() => undefined} onClose={() => undefined} />
      </div>,
    );
    const button = screen.getByRole("button", { name: /Connect — \$4\.99/i });
    const notice = noticeBefore(button);
    expect(notice.textContent).toContain("Fees are generally non-refundable once delivered");
    expect(within(notice).getByRole("link", { name: "Refund Policy" })).toHaveAttribute("href", "/refunds");
    // Nothing else sits between the notice and the buttons.
    expect(notice.parentElement?.nextElementSibling).toContainElement(button);
    // Wraps on a narrow screen instead of overflowing.
    expect(notice.className).not.toMatch(/whitespace-nowrap|truncate/);
  });

  it("sits directly above the $9.99 Pay button on the activation screen", () => {
    render(
      <AuthContext.Provider
        value={signedInAuth("CUSTOMER", { signup_fee_enabled: true, signup_fee_status: "UNPAID" })}
      >
        <MemoryRouter initialEntries={["/activate"]}>
          <div className="mx-auto w-[390px] max-w-[390px]">
            <ActivateAccountPage />
          </div>
        </MemoryRouter>
      </AuthContext.Provider>,
    );
    const button = screen.getByRole("button", { name: "Pay $9.99" });
    const notice = noticeBefore(button);
    expect(notice.nextElementSibling).toBe(button);
    expect(within(notice).getByRole("link", { name: "Refund Policy" })).toHaveAttribute("href", "/refunds");
  });

  it("is copy only: no fee amount, checkout, or refund call is added", () => {
    const component = readFileSync(path.join(srcRoot, "components/payments/CheckoutRefundNotice.tsx"), "utf8");
    expect(component).not.toMatch(/import .*(supabase|signupFee|marketplace\/api)|fetch\(|functions\.invoke|Checkout\(|checkout_url|refunds\.create|_cents/);
    expect(component).not.toMatch(/\$9\.99|\$4\.99|999|499/);
  });
});
