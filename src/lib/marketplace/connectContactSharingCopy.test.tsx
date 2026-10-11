import { render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it } from "vitest";
import { ConnectConfirmDialog } from "../../components/marketplace/ConnectConfirm";
import { ContractorConnectionCta } from "../../components/marketplace/ContractorConnectionCta";
import { CONNECTION_FEE_NO_HIRE_GUARANTEE, PRICING_FAQ } from "../../data/pricing";
import { privateContactHintCopy, privateContactLockedCopy } from "./bookings";
import {
  CHECKOUT_PENDING_COPY,
  CONNECT_CHECKOUT_CONFIRM_EXTRA,
  CONNECT_CONFIRM_BODY,
  CONNECT_DOES_NOT_UNLOCK_COPY,
  CONNECT_REDIRECTING_COPY,
  CONNECT_WHAT_YOU_GET_COPY,
  JOBS_STREET_HELPER_COPY,
  OPPORTUNITY_CONTACT_LOCKED_COPY,
} from "./connectionLifecycle";
import { SHARE_CONTACT_LOCKED_BODY } from "./contactShare";
import { CONTRACTOR_CONTACT_LOCKED_COPY, HOW_FEES_WORK_BODY } from "./contractorPolish";

const CUSTOMER_CONTROLS = /customer (then )?decides (if and )?when to share/i;
/** Wording that would promise contact on payment. Homeowner-controlled sharing forbids it. */
const PAYMENT_REVEALS =
  /(stays? (hidden|locked) until (you )?(connect|pay|have a paid)|until the server verifies the \$4\.99 payment\. contact|payment (unlocks|reveals) (contact|phone|address)|buys connection access)/i;

describe("homeowner-controlled contact sharing is clear before $4.99 payment", () => {
  const prePayment = {
    CONNECT_WHAT_YOU_GET_COPY,
    CONNECT_CONFIRM_BODY,
    JOBS_STREET_HELPER_COPY,
    OPPORTUNITY_CONTACT_LOCKED_COPY,
    CHECKOUT_PENDING_COPY,
    CONNECT_REDIRECTING_COPY,
    CONNECT_DOES_NOT_UNLOCK_COPY,
    HOW_FEES_WORK_BODY,
    CONNECTION_FEE_NO_HIRE_GUARANTEE,
  };

  it.each(Object.entries(prePayment))("%s says $4.99 opens messaging and the customer controls sharing", (_name, text) => {
    expect(text).toMatch(/messag|customer decides/i);
    expect(text).toMatch(CUSTOMER_CONTROLS);
    expect(text).not.toMatch(PAYMENT_REVEALS);
  });

  it("does not promise contact on payment in contractor-locked, admin, or checkout copy", () => {
    for (const text of [
      CONNECT_CHECKOUT_CONFIRM_EXTRA,
      CONTRACTOR_CONTACT_LOCKED_COPY,
      privateContactLockedCopy(),
      privateContactHintCopy(),
      SHARE_CONTACT_LOCKED_BODY,
    ]) {
      expect(text).not.toMatch(PAYMENT_REVEALS);
    }
    expect(CONTRACTOR_CONTACT_LOCKED_COPY).toMatch(/only if the customer chooses to share/i);
    expect(SHARE_CONTACT_LOCKED_BODY).toMatch(/you decide if and when to share/i);
  });

  it("shows the what-you-get sentence right above the Connect button", () => {
    render(<ContractorConnectionCta state="connect" onConnect={() => undefined} />);
    const note = screen.getByTestId("connect-what-you-get");
    expect(note).toHaveTextContent(CONNECT_WHAT_YOU_GET_COPY);
    expect(screen.getByRole("button", { name: /Connect — \$4\.99/ })).toBeInTheDocument();
  });

  it("does not show the what-you-get sentence once connected", () => {
    render(<ContractorConnectionCta state="connected" onConnect={() => undefined} />);
    expect(screen.queryByTestId("connect-what-you-get")).not.toBeInTheDocument();
  });

  it("states customer control inside the confirm dialog before checkout starts", () => {
    render(
      <MemoryRouter>
        <ConnectConfirmDialog open busy={false} onConfirm={() => undefined} onClose={() => undefined} />
      </MemoryRouter>,
    );
    const dialog = screen.getByRole("dialog");
    expect(within(dialog).getByText(CUSTOMER_CONTROLS)).toBeInTheDocument();
    expect(within(dialog).getByText(/does not reveal them|Paying does not reveal them/i)).toBeInTheDocument();
  });

  it("answers the phone/address question in the pricing FAQ", () => {
    const faq = PRICING_FAQ.find((item) => /phone number or address/i.test(item.question));
    expect(faq?.answer).toMatch(/^No\./);
    expect(faq?.answer).toMatch(CUSTOMER_CONTROLS);
  });

  it("is copy only: fee label and amount are unchanged", () => {
    expect(CONNECT_WHAT_YOU_GET_COPY).toMatch(/\$4\.99/);
    expect(CONNECT_WHAT_YOU_GET_COPY).not.toMatch(/\$[0-9]+\.[0-9]{2}(?<!\$4\.99)/);
  });
});
