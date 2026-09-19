import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";
import { ConfirmDialog } from "../../../components/ui/ConfirmDialog";
import { ContractorEstimateCard, EstimateStatusChip } from "./ProEstimatesPages";
import { ManageProfileBadge } from "./ProProfilePages";
import { profilePageMode } from "../../../lib/marketplace/profileManage";
import type { ContractorEstimateListItem } from "../../../lib/marketplace/api";
import {
  DELETE_ESTIMATE_BODY,
  DELETE_ESTIMATE_CONFIRM,
  DELETE_ESTIMATE_TITLE,
  WITHDRAW_ESTIMATE_BODY,
} from "../../../lib/marketplace/estimateLifecycle";

const sent: ContractorEstimateListItem = {
  id: "e1",
  project_id: "p1",
  opportunity_id: "o1",
  project_title: "Fence repair",
  status: "SENT",
  total_cents: 25000,
  submitted_at: "2026-09-17T12:00:00.000Z",
  first_viewed_at: null,
  last_viewed_at: null,
  view_count: 0,
  accepted_at: null,
  declined_at: null,
  decline_reason: null,
  withdrawn_at: null,
  created_at: "2026-09-17T11:00:00.000Z",
};

describe("Manage Profile vs onboarding UI", () => {
  it("uses Manage Profile after approval and onboarding, otherwise the wizard", () => {
    expect(profilePageMode({ onboarding_status: "COMPLETE", approval_status: "APPROVED" })).toBe("manage");
    expect(profilePageMode({ onboarding_status: "SUBMITTED", approval_status: "PENDING" })).toBe("onboarding");
    render(<ManageProfileBadge approved />);
    expect(screen.getByText(/approved/i)).toBeInTheDocument();
  });
});

describe("contractor estimates status copy", () => {
  it("shows Sent, Viewed with timestamp, Accepted, and Not Selected without rival details", () => {
    render(
      <MemoryRouter>
        <ul>
          <ContractorEstimateCard row={sent} />
          <ContractorEstimateCard
            row={{
              ...sent,
              id: "e2",
              status: "VIEWED",
              first_viewed_at: "2026-09-17T13:00:00.000Z",
              last_viewed_at: "2026-09-17T13:00:00.000Z",
              view_count: 1,
            }}
          />
          <ContractorEstimateCard row={{ ...sent, id: "e3", status: "ACCEPTED" }} />
          <ContractorEstimateCard
            row={{ ...sent, id: "e4", status: "DECLINED", decline_reason: "ANOTHER_ESTIMATE_ACCEPTED" }}
          />
          <ContractorEstimateCard
            row={{ ...sent, id: "e5", status: "DECLINED", decline_reason: "CUSTOMER_DECLINED" }}
          />
        </ul>
      </MemoryRouter>,
    );
    expect(screen.getByText(/sent — awaiting customer review/i)).toBeInTheDocument();
    expect(screen.getByText(/viewed by customer/i)).toBeInTheDocument();
    expect(screen.getByText(/the customer selected your estimate/i)).toBeInTheDocument();
    expect(screen.getByText(/the customer selected another pro for this project/i)).toBeInTheDocument();
    expect(screen.getByText(/the customer decided not to move forward with this estimate/i)).toBeInTheDocument();
    expect(screen.queryByText(/rival/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/REJECTED/)).not.toBeInTheDocument();
    expect(screen.getAllByText(/fence repair/i).length).toBeGreaterThan(0);
    expect(screen.queryByRole("button", { name: /delete draft/i })).not.toBeInTheDocument();
  });

  it("offers Delete draft only on contractor-owned drafts, not sent or accepted estimates", async () => {
    const user = userEvent.setup();
    const onRequestDelete = vi.fn();
    render(
      <MemoryRouter>
        <ul>
          <ContractorEstimateCard row={{ ...sent, id: "draft-1", status: "DRAFT", submitted_at: null }} onRequestDelete={onRequestDelete} />
          <ContractorEstimateCard row={sent} />
          <ContractorEstimateCard row={{ ...sent, id: "e3", status: "ACCEPTED" }} />
          <ContractorEstimateCard row={{ ...sent, id: "e6", status: "WITHDRAWN" }} />
        </ul>
      </MemoryRouter>,
    );
    const deleteButtons = screen.getAllByRole("button", { name: /delete draft/i });
    expect(deleteButtons).toHaveLength(1);
    await user.click(deleteButtons[0]);
    expect(onRequestDelete).toHaveBeenCalledTimes(1);
  });

  it("confirms delete as a permanent draft removal and keeps withdraw copy distinct", async () => {
    const user = userEvent.setup();
    const onConfirm = vi.fn();
    render(
      <ConfirmDialog
        open
        title={DELETE_ESTIMATE_TITLE}
        body={DELETE_ESTIMATE_BODY}
        confirmLabel={DELETE_ESTIMATE_CONFIRM}
        cancelLabel="Keep draft"
        onConfirm={onConfirm}
        onClose={() => undefined}
      />,
    );
    expect(screen.getByRole("heading", { name: /delete this draft estimate/i })).toBeInTheDocument();
    expect(screen.getByText(/permanently removed/i)).toBeInTheDocument();
    expect(screen.getByText(/withdraw those instead/i)).toBeInTheDocument();
    expect(screen.queryByText(WITHDRAW_ESTIMATE_BODY)).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: /delete draft/i }));
    expect(onConfirm).toHaveBeenCalledTimes(1);

    const page = readFileSync(path.resolve(path.dirname(fileURLToPath(import.meta.url)), "ProEstimatesPages.tsx"), "utf8");
    expect(page).toMatch(/deleteEstimate/);
    expect(page).toMatch(/DELETE_ESTIMATE_SUCCESS/);
    expect(page).toMatch(/fetchMyEstimates/);
    expect(page).toMatch(/withdraw stays|Withdraw keeps a sent estimate/i);
  });

  it("does not treat a status chip render as marking VIEWED", async () => {
    const user = userEvent.setup();
    render(<EstimateStatusChip status="sent" />);
    expect(screen.getByText(/awaiting customer review/i)).toBeInTheDocument();
    await user.click(screen.getByText(/awaiting customer review/i));
    expect(screen.getByText(/awaiting customer review/i)).toBeInTheDocument();
  });
});
