import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ReactNode } from "react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it } from "vitest";
import { AuthContext } from "../../lib/auth/AuthContext";
import { signedInAuth } from "../../lib/auth/authFixture";
import type { InAppNotification } from "../../lib/notifications/api";
import { NotificationBell } from "./NotificationBell";
import { NotificationSettings } from "./NotificationSettings";

function renderWithAuth(ui: ReactNode) {
  return render(
    <AuthContext.Provider value={signedInAuth("CUSTOMER")}>
      <MemoryRouter>{ui}</MemoryRouter>
    </AuthContext.Provider>,
  );
}

const items: InAppNotification[] = [
  {
    id: "n1",
    kind: "estimate.received",
    title: "New estimate received",
    body: "A contractor sent an estimate for your project.",
    path: "/app/customer/projects/project-1/estimates/est-1",
    readAt: null,
    createdAt: new Date().toISOString(),
    category: "estimates",
  },
];

describe("notification bell", () => {
  it("shows the unread count and links the alert to its page", async () => {
    const user = userEvent.setup();
    renderWithAuth(<NotificationBell preview={{ items, unread: 1 }} />);
    await user.click(screen.getByRole("button", { name: /notifications, 1 unread/i }));
    expect(screen.getByRole("dialog", { name: /notifications/i })).toBeInTheDocument();
    const link = screen.getByRole("link", { name: /new estimate received/i });
    expect(link).toHaveAttribute("href", "/app/customer/projects/project-1/estimates/est-1");
    expect(screen.getByRole("button", { name: /mark all read/i })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /notification settings/i })).toHaveAttribute(
      "href",
      "/app/customer/account/notifications",
    );
  });
});

describe("notification settings", () => {
  it("starts from the default channels and toggles one without the others", async () => {
    const user = userEvent.setup();
    renderWithAuth(<NotificationSettings mode="preview" />);
    expect(screen.getByRole("heading", { name: /notification settings/i })).toBeInTheDocument();
    const messagesEmail = screen.getByRole("switch", { name: /messages email/i });
    const messagesPush = screen.getByRole("switch", { name: /messages push/i });
    const reviewsEmail = screen.getByRole("switch", { name: /reviews email/i });
    expect(messagesEmail).toHaveAttribute("aria-checked", "true");
    expect(messagesPush).toHaveAttribute("aria-checked", "false");
    expect(reviewsEmail).toHaveAttribute("aria-checked", "false");
    await user.click(messagesEmail);
    expect(messagesEmail).toHaveAttribute("aria-checked", "false");
    expect(messagesPush).toHaveAttribute("aria-checked", "false");
    expect(screen.getByRole("button", { name: /enable push notifications/i })).toBeInTheDocument();
  });

  it("shows the iPhone Home Screen guide instead of a push button", () => {
    renderWithAuth(<NotificationSettings mode="preview" forceIosGuide />);
    expect(screen.getByRole("heading", { name: /add to home screen to get alerts/i })).toBeInTheDocument();
    expect(screen.getByText(/ios 16\.4 or later/i)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /enable push notifications/i })).not.toBeInTheDocument();
  });
});
