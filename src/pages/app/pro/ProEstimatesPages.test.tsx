import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it } from "vitest";
import { ContractorEstimateCard, EstimateStatusChip } from "./ProEstimatesPages";
import { ManageProfileBadge } from "./ProProfilePages";
import { profilePageMode } from "../../../lib/marketplace/profileManage";
import type { ContractorEstimateListItem } from "../../../lib/marketplace/api";

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
  });

  it("does not treat a status chip render as marking VIEWED", async () => {
    const user = userEvent.setup();
    render(<EstimateStatusChip status="sent" />);
    expect(screen.getByText(/awaiting customer review/i)).toBeInTheDocument();
    await user.click(screen.getByText(/awaiting customer review/i));
    expect(screen.getByText(/awaiting customer review/i)).toBeInTheDocument();
  });
});
