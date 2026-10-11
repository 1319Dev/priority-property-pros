import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";
import type { InAppNotification } from "../../lib/notifications/api";
import { NotificationHistoryView } from "./NotificationHistoryPage";

const item: InAppNotification = {
  id: "n1",
  kind: "change_order.approved",
  title: "Change order approved",
  body: "A change order on your project was approved.",
  path: "/app/customer/bookings/book-1",
  projectTitle: "Fence repair",
  referenceNumber: 1004,
  actionState: "open",
  readAt: null,
  createdAt: "2026-10-08T12:00:00.000Z",
  category: "change_orders",
};

describe("NotificationHistoryView", () => {
  it("shows the job number, a deep link, and a past label", async () => {
    const user = userEvent.setup();
    const onOpen = vi.fn();
    render(
      <MemoryRouter>
        <NotificationHistoryView
          items={[
            item,
            {
              ...item,
              id: "past",
              title: "New estimate received",
              actionState: "historical",
              readAt: "2026-10-09T00:00:00.000Z",
              projectTitle: "123 Main Street",
              body: "Email pat@example.com",
            },
          ]}
          ready
          loadError={null}
          settingsPath="/app/customer/account/notifications"
          onOpen={onOpen}
        />
      </MemoryRouter>,
    );

    expect(screen.getByRole("heading", { name: "Notification history" })).toBeInTheDocument();
    const link = screen.getByRole("link", { name: /Change order approved/ });
    expect(link).toHaveAttribute("href", "/app/customer/bookings/book-1");
    expect(screen.getByText("Fence repair · PPP-1004")).toBeInTheDocument();
    expect(screen.getByText("Past")).toBeInTheDocument();
    expect(screen.getByText("PPP-1004")).toBeInTheDocument();
    expect(screen.queryByText(/123 Main Street/)).not.toBeInTheDocument();
    expect(screen.queryByText(/pat@example.com/i)).not.toBeInTheDocument();
    await user.click(link);
    expect(onOpen).toHaveBeenCalledWith(expect.objectContaining({ id: "n1" }));
  });

  it("shows loading, empty, and a non-technical error", () => {
    const { rerender } = render(
      <MemoryRouter>
        <NotificationHistoryView items={[]} ready={false} loadError={null} settingsPath="/notifications" onOpen={() => undefined} />
      </MemoryRouter>,
    );
    expect(screen.getByRole("heading", { name: "Notification history" })).toBeInTheDocument();
    expect(screen.getByText(/loading notifications/i)).toBeInTheDocument();

    rerender(
      <MemoryRouter>
        <NotificationHistoryView items={[]} ready loadError={null} settingsPath="/notifications" onOpen={() => undefined} />
      </MemoryRouter>,
    );
    expect(screen.getByText("No notifications yet")).toBeInTheDocument();

    rerender(
      <MemoryRouter>
        <NotificationHistoryView
          items={[]}
          ready
          loadError="cannot add postgres_changes callbacks for realtime:notifications:user after subscribe()"
          settingsPath="/notifications"
          onOpen={() => undefined}
        />
      </MemoryRouter>,
    );
    expect(screen.getByText("Couldn't load notifications.")).toBeInTheDocument();
    expect(screen.queryByText(/postgres_changes|after subscribe/i)).not.toBeInTheDocument();
    expect(screen.queryByText("No notifications yet")).not.toBeInTheDocument();
  });
});
