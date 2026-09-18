import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { ContractorConnectionCta } from "../../../components/marketplace/ContractorConnectionCta";
import { EndJobDialog } from "../../../components/marketplace/EndJobDialog";
import { CONNECT_BUTTON_LABEL } from "../../../lib/marketplace/connectionLifecycle";
import { CONNECT_SINGLE_STEP_COPY, END_JOB_BUTTON_LABEL, END_JOB_TITLE } from "../../../lib/marketplace/contractorJobActions";
import { opportunityNextActions } from "../../../lib/marketplace/statusLabels";

const pageFile = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "ProMarketplacePages.tsx");

describe("contractor job detail UX", () => {
  const page = readFileSync(pageFile, "utf8");

  it("uses one Connect CTA and an End this job action", () => {
    expect(page).toMatch(/runContractorConnect/);
    expect(page).toMatch(/acceptOpportunity/);
    expect(page).toMatch(/endContractorJob/);
    expect(page).toMatch(/EndJobDialog/);
    expect(page).toMatch(/CONNECT_SINGLE_STEP_COPY/);
    expect(page).not.toMatch(/>\s*Participate\s*</);
    expect(page).not.toMatch(/>\s*Pass\s*</);
    expect(opportunityNextActions({ opportunityId: "o1", status: "AVAILABLE", projectStatus: "POSTED" })[0]?.label).toBe(
      "Connect",
    );
  });

  it("keeps Connect and End obvious at ~390px", () => {
    const { rerender } = render(
      <div className="mx-auto w-[390px] max-w-[390px] space-y-3">
        <p>{CONNECT_SINGLE_STEP_COPY}</p>
        <ContractorConnectionCta state="connect" onConnect={() => undefined} />
        <button type="button">{END_JOB_BUTTON_LABEL}</button>
      </div>,
    );
    expect(screen.getByText(/do not need a separate Participate step/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: CONNECT_BUTTON_LABEL })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: END_JOB_BUTTON_LABEL })).toBeInTheDocument();

    rerender(
      <div className="mx-auto w-[390px] max-w-[390px]">
        <EndJobDialog open busy={false} connectionStatus="PAYMENT_DISABLED" onConfirm={() => undefined} onClose={() => undefined} />
      </div>,
    );
    expect(screen.getByRole("heading", { name: END_JOB_TITLE })).toBeInTheDocument();
    expect(screen.getByText(/unpaid connection spots are freed/i)).toBeInTheDocument();
  });
});
