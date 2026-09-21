import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { ContractorConnectionCta } from "../../../components/marketplace/ContractorConnectionCta";
import { EndJobDialog } from "../../../components/marketplace/EndJobDialog";
import { CONNECT_BUTTON_LABEL } from "../../../lib/marketplace/connectionLifecycle";
import {
  CONNECT_SINGLE_STEP_COPY,
  PASS_SKIP_CONFIRM,
  PASS_SKIP_LABEL,
  PASS_SKIP_TITLE,
} from "../../../lib/marketplace/contractorJobActions";
import { opportunityNextActions } from "../../../lib/marketplace/statusLabels";

const pageFile = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "ProMarketplacePages.tsx");

describe("contractor job detail UX", () => {
  const page = readFileSync(pageFile, "utf8");

  it("uses one Connect CTA and Pass on this job for unpaid skip", () => {
    expect(page).toMatch(/runContractorConnect/);
    expect(page).toMatch(/acceptOpportunity/);
    expect(page).toMatch(/endContractorJob/);
    expect(page).toMatch(/EndJobDialog/);
    expect(page).toMatch(/declineJobButtonLabel/);
    expect(page).toMatch(/declineJobToast/);
    expect(page).toMatch(/CONNECT_SINGLE_STEP_COPY/);
    expect(page).not.toMatch(/>\s*Participate\s*</);
    expect(page).not.toMatch(/Job ended\. History was kept/);
    expect(opportunityNextActions({ opportunityId: "o1", status: "AVAILABLE", projectStatus: "POSTED" })[0]?.label).toBe(
      "Connect",
    );
  });

  it("keeps Connect and Pass obvious at ~390px, including the unpaid confirm modal", () => {
    const { rerender } = render(
      <div className="mx-auto w-[390px] max-w-[390px] space-y-3">
        <p>{CONNECT_SINGLE_STEP_COPY}</p>
        <ContractorConnectionCta state="connect" onConnect={() => undefined} />
        <button type="button">{PASS_SKIP_LABEL}</button>
      </div>,
    );
    expect(screen.getByText(/do not need a separate Participate step/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: CONNECT_BUTTON_LABEL })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: PASS_SKIP_LABEL })).toBeInTheDocument();

    rerender(
      <div className="mx-auto w-[390px] max-w-[390px]">
        <EndJobDialog open busy={false} connectionStatus="PAYMENT_DISABLED" onConfirm={() => undefined} onClose={() => undefined} />
      </div>,
    );
    expect(screen.getByRole("heading", { name: PASS_SKIP_TITLE })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: PASS_SKIP_CONFIRM })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /keep this job/i })).toBeInTheDocument();
    expect(screen.getByText(/passing removes this job from your list/i)).toBeInTheDocument();
    expect(screen.getByText(/next best-suited contractor can be invited/i)).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: /end this job/i })).not.toBeInTheDocument();
  });
});

describe("estimate builder delete vs withdraw", () => {
  const page = readFileSync(pageFile, "utf8");
  const customerPage = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../customer/CustomerMarketplacePages.tsx");
  const customer = readFileSync(customerPage, "utf8");

  it("deletes drafts through confirm + RPC and keeps withdraw for sent estimates", () => {
    expect(page).toMatch(/deleteEstimate/);
    expect(page).toMatch(/DELETE_ESTIMATE_TITLE/);
    expect(page).toMatch(/contractorEstimateDestructiveAction/);
    expect(page).toMatch(/withdrawEstimate/);
    expect(page).toMatch(/WITHDRAW_ESTIMATE_TITLE/);
    expect(page).toMatch(/It is not deleted|WITHDRAW_ESTIMATE_BODY/);
    expect(page).toMatch(/navigate\("\/app\/pro\/estimates"\)/);
    expect(customer).not.toMatch(/deleteEstimate\(/);
    expect(customer).not.toMatch(/DELETE_ESTIMATE/);
  });
});
