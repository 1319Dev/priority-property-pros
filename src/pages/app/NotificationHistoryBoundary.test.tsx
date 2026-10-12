import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AuthContext } from "../../lib/auth/AuthContext";
import { signedInAuth } from "../../lib/auth/authFixture";
import { NotificationHistoryPage } from "./NotificationHistoryPage";

vi.mock("../../lib/notifications/useNotifications", () => ({
  useNotifications: () => {
    throw new Error("cannot add postgres_changes callbacks for realtime:notifications:user-1 after subscribe()");
  },
}));

describe("notification history error boundary", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("keeps the header when rendering throws", () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    render(
      <AuthContext.Provider value={signedInAuth("CUSTOMER")}>
        <MemoryRouter>
          <NotificationHistoryPage />
        </MemoryRouter>
      </AuthContext.Provider>,
    );
    expect(screen.getByRole("heading", { name: "Notification history" })).toBeInTheDocument();
    expect(screen.getByText("Couldn't load notifications.")).toBeInTheDocument();
    expect(screen.queryByText(/postgres_changes|after subscribe/i)).not.toBeInTheDocument();
  });
});
