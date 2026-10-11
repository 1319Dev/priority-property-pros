import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it } from "vitest";
import type { InAppNotificationRow } from "../../../lib/marketplace/api";
import { ProNotificationsList } from "./ProEstimatesPages";

function row(partial: Partial<InAppNotificationRow> & Pick<InAppNotificationRow, "id" | "kind" | "title">): InAppNotificationRow {
  return {
    body: "A change order on your project was approved.",
    entity_type: "change_orders",
    entity_id: "co-1",
    payload: {},
    channel: "in_app",
    read_at: null,
    created_at: "2026-10-08T12:00:00.000Z",
    ...partial,
  };
}

describe("ProNotificationsList", () => {
  it("links a change order to the job and hides finished or message rows", () => {
    render(
      <MemoryRouter>
        <ProNotificationsList
          previewRows={[
            row({
              id: "approved",
              kind: "change_order.approved",
              title: "Change order approved",
              payload: {
                booking_id: "book-1",
                project_title: "Fence repair",
                project_reference_number: 1004,
                path: "/app/pro/bookings/book-1",
                business_name: "Secret Fencing LLC",
              },
            }),
            row({
              id: "old",
              kind: "change_order.proposed",
              title: "Change order proposed",
              action_state: "historical",
            }),
            row({
              id: "message",
              kind: "message.received",
              title: "New message",
              body: "New message about your project.",
              entity_type: "project_message_threads",
            }),
            row({
              id: "private",
              kind: "booking.hired",
              title: "Call 512-555-0199",
              body: "Meet at 123 Main Street. Email pat@example.com.",
              entity_type: "bookings",
              entity_id: "book-9",
              payload: { booking_id: "book-9", project_title: "123 Main Street", project_reference_number: 1102 },
            }),
          ]}
        />
      </MemoryRouter>,
    );

    const link = screen.getByRole("link", { name: /Change order approved/ });
    expect(link).toHaveAttribute("href", "/app/pro/jobs/book-1");
    expect(screen.getByText("Fence repair · PPP-1004")).toBeInTheDocument();
    expect(screen.queryByText("Change order proposed")).not.toBeInTheDocument();
    expect(screen.queryByText("New message")).not.toBeInTheDocument();
    expect(screen.queryByText(/Secret Fencing LLC/)).not.toBeInTheDocument();
    expect(screen.queryByText(/512-555-0199/)).not.toBeInTheDocument();
    expect(screen.queryByText(/pat@example.com/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/123 Main Street/i)).not.toBeInTheDocument();
    expect(screen.getByText("PPP-1102")).toBeInTheDocument();
  });
});
