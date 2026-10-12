import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AuthContext } from "../lib/auth/AuthContext";
import { authValue } from "../lib/auth/authFixture";
import { PricingPage } from "../pages/PricingPage";
import { TrustPage } from "../pages/TrustPage";
import {
  CONNECTION_FEE_DELIVERED_NON_REFUNDABLE,
  CONNECTION_FEE_NON_REFUNDABLE,
  CONTRACTOR_ACCOUNT_DIFFERENCE,
  CONTRACTOR_SIGNUP_LEDE,
  PLATFORM_FEES_NON_REFUNDABLE,
  PRICING_FAQ,
  PRICING_PAGE_INTRO,
  SIGNUP_FEE_NON_REFUNDABLE,
  SIGNUP_TERMS_ACCEPTANCE,
} from "./pricing";
import { FAQ_ITEMS } from "./faq";
import { HOW_FEES_WORK_BODY } from "../lib/marketplace/contractorPolish";
import { CONNECTED_BODY, REFUND_CONCEPT_COPY } from "../lib/marketplace/connectionLifecycle";

const srcRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function sourceFiles(dir: string): string[] {
  const out: string[] = [];
  for (const name of readdirSync(dir)) {
    const full = path.join(dir, name);
    if (statSync(full).isDirectory()) out.push(...sourceFiles(full));
    else if (/\.(ts|tsx)$/.test(name) && !/\.test\.(ts|tsx)$/.test(name)) out.push(full);
  }
  return out;
}

// A flat "$4.99 is non-refundable" claim with no delivered/auto-refund qualifier.
const FLAT_CONNECT_CLAIMS = [
  /Connection Fee is non-refundable\./i,
  /Connection Fee are non-refundable/i,
  /Both fees are non-refundable/i,
  /connection fee is non-refundable and/i,
];

describe("$4.99 Connection Fee refund copy (owner decision 2026-10-11, PR #136)", () => {
  it("no site source makes a flat $4.99 non-refundable claim", () => {
    const hits: string[] = [];
    for (const file of sourceFiles(srcRoot)) {
      const text = readFileSync(file, "utf8");
      for (const pattern of FLAT_CONNECT_CLAIMS) {
        if (pattern.test(text)) hits.push(`${path.relative(srcRoot, file)} matches ${pattern}`);
      }
    }
    expect(hits).toEqual([]);
  });

  it("states delivered = non-refundable and undeliverable = automatic refund", () => {
    expect(CONNECTION_FEE_NON_REFUNDABLE).toBe(
      "The $4.99 Connection Fee is non-refundable once the connection is delivered. If you are charged but the connection can't be provided, the $4.99 is refunded automatically.",
    );
    for (const text of [PLATFORM_FEES_NON_REFUNDABLE, PRICING_PAGE_INTRO, CONTRACTOR_SIGNUP_LEDE, HOW_FEES_WORK_BODY, REFUND_CONCEPT_COPY]) {
      expect(text).toMatch(/non-refundable once the connection is delivered/i);
      expect(text).toMatch(/refunded automatically/i);
    }
    const refundFaq = PRICING_FAQ.find((item) => /refundable/i.test(item.question));
    expect(refundFaq?.answer).toMatch(/cancelled or closed, the opportunity expired, the customer blocked you, or you were charged twice/);
    const proFaq = FAQ_ITEMS.find((item) => item.question === "What do contractors pay?");
    expect(proFaq?.answer).toContain(CONNECTION_FEE_NON_REFUNDABLE);
    expect(CONNECTED_BODY).toContain(CONNECTION_FEE_DELIVERED_NON_REFUNDABLE);
    expect(CONTRACTOR_ACCOUNT_DIFFERENCE).not.toMatch(/refund/i);
  });

  it("keeps the $9.99 activation refund policy unchanged", () => {
    expect(SIGNUP_FEE_NON_REFUNDABLE).toBe("The $9.99 account activation fee is non-refundable.");
    expect(PLATFORM_FEES_NON_REFUNDABLE.startsWith(SIGNUP_FEE_NON_REFUNDABLE)).toBe(true);
    expect(SIGNUP_TERMS_ACCEPTANCE).toMatch(/\$9\.99 account activation fee is non-refundable\./);
    for (const file of sourceFiles(srcRoot)) {
      expect(readFileSync(file, "utf8")).not.toMatch(/\$9\.99[^".`]{0,60}refunded automatically/i);
    }
  });

  it("renders the rule on Pricing (once in the intro plus the FAQ) and Trust", () => {
    const pricing = render(
      <AuthContext.Provider value={authValue()}>
        <MemoryRouter>
          <PricingPage />
        </MemoryRouter>
      </AuthContext.Provider>,
    );
    const text = pricing.container.textContent ?? "";
    expect(text.match(/non-refundable once the connection is delivered/g)?.length).toBe(2);
    expect(text.match(/The \$9\.99 account activation fee is non-refundable/g)?.length).toBe(2);
    pricing.unmount();
    const trust = render(
      <AuthContext.Provider value={authValue()}>
        <MemoryRouter>
          <TrustPage />
        </MemoryRouter>
      </AuthContext.Provider>,
    );
    expect(trust.container.textContent).toContain(PLATFORM_FEES_NON_REFUNDABLE);
  });
});

vi.mock("../lib/marketplace/api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../lib/marketplace/api")>();
  return { ...actual, reconcileConnectionCheckout: vi.fn() };
});

describe("checkout return page", () => {
  afterEach(() => vi.clearAllMocks());

  it("says an undeliverable paid connection is being refunded automatically", async () => {
    const api = await import("../lib/marketplace/api");
    vi.mocked(api.reconcileConnectionCheckout).mockResolvedValue({ paid: false, contact_unlocked: false, needs_refund: true, refund_status: "SUCCEEDED" });
    const { ConnectionCheckoutReturnPage, CONNECTION_REFUNDING_COPY } = await import("../pages/app/pro/ConnectionCheckoutReturnPage");
    render(
      <MemoryRouter initialEntries={["/app/pro/connections/return?session_id=cs_test_x"]}>
        <ConnectionCheckoutReturnPage />
      </MemoryRouter>,
    );
    expect(await screen.findByText(CONNECTION_REFUNDING_COPY)).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: /Not connected yet/i })).toBeInTheDocument();
    expect(screen.queryByText(CONNECTION_FEE_DELIVERED_NON_REFUNDABLE)).not.toBeInTheDocument();
  });

  it("says a delivered connection is non-refundable", async () => {
    const api = await import("../lib/marketplace/api");
    vi.mocked(api.reconcileConnectionCheckout).mockResolvedValue({ paid: true, contact_unlocked: true });
    const { ConnectionCheckoutReturnPage } = await import("../pages/app/pro/ConnectionCheckoutReturnPage");
    render(
      <MemoryRouter initialEntries={["/app/pro/connections/return?session_id=cs_test_y"]}>
        <ConnectionCheckoutReturnPage />
      </MemoryRouter>,
    );
    expect(await screen.findByText(CONNECTION_FEE_DELIVERED_NON_REFUNDABLE)).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: /^Connected$/ })).toBeInTheDocument();
  });
});
