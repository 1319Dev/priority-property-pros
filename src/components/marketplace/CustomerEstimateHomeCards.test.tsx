import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { AuthContext } from "../../lib/auth/AuthContext";
import { signedInAuth } from "../../lib/auth/authFixture";
import type { InAppNotificationRow } from "../../lib/marketplace/api";
import type { Project } from "../../lib/marketplace/types";
import { CustomerEstimateHomeCards } from "./CustomerEstimateHomeCards";

vi.mock("../../lib/marketplace/api", () => ({
  fetchMyNotifications: vi.fn(),
  fetchCustomerProjects: vi.fn(async () => []),
  fetchMyBookings: vi.fn(async () => []),
  markNotificationRead: vi.fn(),
}));

import { fetchCustomerProjects, fetchMyBookings, fetchMyNotifications, markNotificationRead } from "../../lib/marketplace/api";

const fetchNotes = vi.mocked(fetchMyNotifications);
const fetchProjects = vi.mocked(fetchCustomerProjects);
const fetchBookings = vi.mocked(fetchMyBookings);
const markRead = vi.mocked(markNotificationRead);

function note(partial: Partial<InAppNotificationRow> & Pick<InAppNotificationRow, "id">): InAppNotificationRow {
  return {
    kind: "estimate.received",
    title: "New estimate received",
    body: "A pro sent an estimate on your project.",
    entity_type: "estimates",
    entity_id: "est-1",
    payload: { project_id: "proj-1", estimate_id: "est-1" },
    channel: "in_app",
    read_at: null,
    created_at: "2026-10-08T12:00:00.000Z",
    ...partial,
  };
}

function project(partial: Partial<Project> & Pick<Project, "id" | "status">): Project {
  return {
    customer_id: "user-1",
    category_id: null,
    title: "Fence repair",
    description: "Replace a few boards.",
    completeness: "HIGH",
    city: null,
    state: null,
    zip_code: null,
    timing: null,
    preferred_date: null,
    budget_min_cents: null,
    budget_max_cents: null,
    draft_step: 0,
    selected_contractor_profile_id: null,
    selected_estimate_id: null,
    posted_at: "2026-10-01T00:00:00.000Z",
    selected_at: null,
    reference_number: 1004,
    created_at: "2026-10-01T00:00:00.000Z",
    updated_at: "2026-10-08T00:00:00.000Z",
    ...partial,
  };
}

describe("CustomerEstimateHomeCards", () => {
  beforeEach(() => {
    fetchNotes.mockReset();
    fetchProjects.mockReset();
    fetchBookings.mockReset();
    markRead.mockReset();
    fetchProjects.mockResolvedValue([]);
    fetchBookings.mockResolvedValue([]);
    markRead.mockResolvedValue({});
  });

  it("links an estimate notice and marks it read", async () => {
    const user = userEvent.setup();
    fetchNotes.mockResolvedValue([
      {
        id: "note-1",
        kind: "estimate.received",
        title: "New estimate",
        body: "A pro priced the fence.",
        entity_type: "estimate",
        entity_id: "est-1",
        payload: { project_id: "proj-1", estimate_id: "est-1" },
        channel: "in_app",
        read_at: null,
        created_at: "2026-10-08T12:00:00.000Z",
      },
      {
        id: "note-2",
        kind: "message.received",
        title: "New message",
        body: "Ignored here",
        entity_type: "message",
        entity_id: "thread-1",
        payload: {},
        channel: "in_app",
        read_at: null,
        created_at: "2026-10-08T13:00:00.000Z",
      },
    ]);
    render(
      <MemoryRouter>
        <CustomerEstimateHomeCards />
      </MemoryRouter>,
    );
    const link = await screen.findByRole("link", { name: /New estimate/ });
    expect(link).toHaveAttribute("href", "/app/customer/projects/proj-1/estimates/est-1");
    expect(screen.queryByText("Ignored here")).not.toBeInTheDocument();
    await user.click(link);
    expect(markRead).toHaveBeenCalledWith("note-1");
  });

  it("names the job and hides a stale estimate after hire", async () => {
    fetchNotes.mockResolvedValue([
      note({
        id: "open-note",
        payload: {
          project_id: "proj-open",
          estimate_id: "est-open",
          project_title: "Fence repair",
          project_reference_number: 1004,
          business_name: "Secret Fencing LLC",
        },
        entity_id: "est-open",
      }),
      note({
        id: "hired-note",
        title: "Stale estimate",
        payload: { project_id: "proj-hired", estimate_id: "est-hired" },
        entity_id: "est-hired",
        created_at: "2026-10-07T12:00:00.000Z",
      }),
      note({
        id: "phone-note",
        title: "Call 512-555-0199",
        body: "Email pat@example.com about 123 Main Street.",
        payload: {
          project_id: "proj-open",
          estimate_id: "est-phone",
          project_title: "123 Main Street",
        },
        entity_id: "est-phone",
        created_at: "2026-10-06T12:00:00.000Z",
      }),
    ]);
    fetchProjects.mockResolvedValue([
      project({ id: "proj-open", status: "ESTIMATES_AVAILABLE", title: "Fence repair", reference_number: 1004 }),
      project({
        id: "proj-hired",
        status: "CONTRACTOR_SELECTED",
        title: "Deck stain",
        selected_estimate_id: "est-hired",
        reference_number: 900,
      }),
    ]);
    render(
      <MemoryRouter>
        <CustomerEstimateHomeCards />
      </MemoryRouter>,
    );
    const link = await screen.findByRole("link", { name: /Fence repair/ });
    expect(link).toHaveAttribute("href", "/app/customer/projects/proj-open/estimates/est-open");
    expect(screen.getByText("Fence repair · PPP-1004")).toBeInTheDocument();
    expect(screen.queryByText("Stale estimate")).not.toBeInTheDocument();
    expect(screen.queryByText(/Secret Fencing LLC/)).not.toBeInTheDocument();
    expect(screen.queryByText(/512-555-0199/)).not.toBeInTheDocument();
    expect(screen.queryByText(/pat@example.com/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/123 Main Street/i)).not.toBeInTheDocument();
    expect(screen.getByText("Update")).toBeInTheDocument();
  });

  it("hides an estimate once the server marks it historical or a booking is hired", async () => {
    fetchNotes.mockResolvedValue([
      note({
        id: "still-open",
        title: "Open estimate",
        payload: { project_id: "proj-open", estimate_id: "est-open" },
        action_state: "open",
      }),
      note({
        id: "done",
        title: "Historical estimate",
        payload: { project_id: "proj-open", estimate_id: "est-old" },
        entity_id: "est-old",
        action_state: "historical",
      }),
      note({
        id: "booked",
        title: "Booked estimate",
        payload: { project_id: "proj-booked", estimate_id: "est-booked" },
        entity_id: "est-booked",
      }),
    ]);
    fetchProjects.mockResolvedValue([
      project({ id: "proj-open", status: "ESTIMATES_AVAILABLE" }),
      project({ id: "proj-booked", status: "ESTIMATES_AVAILABLE", title: "Gutter clean", reference_number: 1100 }),
    ]);
    fetchBookings.mockResolvedValue([
      {
        project_id: "proj-booked",
        status: "CONFIRMED",
        customer_hired_at: "2026-10-09T00:00:00.000Z",
        contractor_hired_at: "2026-10-09T00:00:00.000Z",
      } as never,
    ]);
    render(
      <AuthContext.Provider value={signedInAuth("CUSTOMER")}>
        <MemoryRouter>
          <CustomerEstimateHomeCards />
        </MemoryRouter>
      </AuthContext.Provider>,
    );
    expect(await screen.findByRole("link", { name: /Open estimate/ })).toBeInTheDocument();
    expect(screen.queryByText("Historical estimate")).not.toBeInTheDocument();
    expect(screen.queryByText("Booked estimate")).not.toBeInTheDocument();
  });
});
