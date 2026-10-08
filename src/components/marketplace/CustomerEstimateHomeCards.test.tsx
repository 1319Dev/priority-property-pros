import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { CustomerEstimateHomeCards } from "./CustomerEstimateHomeCards";

vi.mock("../../lib/marketplace/api", () => ({
  fetchMyNotifications: vi.fn(),
  markNotificationRead: vi.fn(),
}));

import { fetchMyNotifications, markNotificationRead } from "../../lib/marketplace/api";

const fetchNotes = vi.mocked(fetchMyNotifications);
const markRead = vi.mocked(markNotificationRead);

describe("CustomerEstimateHomeCards", () => {
  beforeEach(() => {
    fetchNotes.mockReset();
    markRead.mockReset();
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
});
