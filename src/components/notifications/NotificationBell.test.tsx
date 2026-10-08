import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ReactNode } from "react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it } from "vitest";
import { AuthContext } from "../../lib/auth/AuthContext";
import { signedInAuth } from "../../lib/auth/authFixture";
import type { InAppNotification } from "../../lib/notifications/api";
import { DashboardShell } from "../layout/DashboardShell";
import { Header } from "../layout/Header";
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

function mockNarrow(matches: boolean) {
  window.matchMedia = (query: string) => ({
    matches: query.includes("max-width") ? matches : false,
    media: query,
    onchange: null,
    addListener: () => undefined,
    removeListener: () => undefined,
    addEventListener: () => undefined,
    removeEventListener: () => undefined,
    dispatchEvent: () => false,
  });
}

const longItem: InAppNotification = {
  ...items[0],
  id: "long",
  title: "Order declined because the proposed start date no longer matches the homeowner request",
  body: "A contractor sent an estimate with a long note that should wrap inside the panel instead of clipping.",
};

describe("notification bell", () => {
  it("shows the unread count and links the alert to its page", async () => {
    mockNarrow(false);
    const user = userEvent.setup();
    renderWithAuth(<NotificationBell preview={{ items, unread: 1 }} />);
    const bell = screen.getByRole("button", { name: /notifications, 1 unread/i });
    await user.click(bell);
    const dialog = screen.getByRole("dialog", { name: /notifications/i });
    expect(dialog).toBeInTheDocument();
    expect(dialog).toHaveFocus();
    expect(dialog.className).toContain("absolute");
    expect(dialog.className).toContain("right-0");
    expect(dialog.className).toContain("w-[min(24rem,calc(100vw-1.5rem))]");
    expect(screen.queryByRole("button", { name: "Close notifications" })).not.toBeInTheDocument();
    const link = screen.getByRole("link", { name: /new estimate received/i });
    expect(link).toHaveAttribute("href", "/app/customer/projects/project-1/estimates/est-1");
    expect(screen.getByRole("button", { name: /mark all read/i })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Notifications" })).toBeInTheDocument();
    const settings = screen.getByRole("link", { name: /notification settings/i });
    expect(settings).toHaveAttribute("href", "/app/customer/account/notifications");
    expect(settings.className).toContain("shrink-0");
    expect(document.body.style.overflow).not.toBe("hidden");

    await user.keyboard("{Escape}");
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(bell).toHaveFocus();
  });

  it("wraps long titles and closes when the pointer goes outside", async () => {
    mockNarrow(false);
    const user = userEvent.setup();
    renderWithAuth(
      <>
        <button type="button">Outside</button>
        <NotificationBell preview={{ items: [longItem], unread: 1 }} />
      </>,
    );
    await user.click(screen.getByRole("button", { name: /notifications, 1 unread/i }));
    const title = screen.getByText(/order declined because/i);
    expect(title.className).toContain("break-words");
    expect(title.className).not.toContain("truncate");
    expect(screen.getByText(/long note that should wrap/i).className).toContain("break-words");
    await user.click(screen.getByRole("button", { name: "Outside" }));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("opens a fixed sheet on a narrow screen with a backdrop, close button, and scroll lock", async () => {
    mockNarrow(true);
    const user = userEvent.setup();
    renderWithAuth(<NotificationBell preview={{ items: [longItem], unread: 1, startOpen: true }} />);
    const dialog = screen.getByRole("dialog", { name: /notifications/i });
    expect(dialog).toHaveFocus();
    expect(dialog.className).toContain("fixed");
    expect(dialog.className).toContain("left-[0.75rem]");
    expect(dialog.className).toContain("right-[0.75rem]");
    expect(dialog.className).toContain("100dvh");
    expect(dialog.className).toContain("env(safe-area-inset-top)");
    expect(dialog.className).toContain("env(safe-area-inset-bottom)");
    expect(screen.getByRole("heading", { name: "Notifications" })).toBeVisible();
    expect(screen.getByRole("button", { name: /mark all read/i })).toBeVisible();
    expect(screen.getByRole("link", { name: /notification settings/i })).toBeVisible();
    expect(document.body.style.overflow).toBe("hidden");
    expect(document.body.style.position).toBe("fixed");

    await user.click(screen.getByRole("button", { name: "Dismiss notifications" }));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(document.body.style.overflow).toBe("");
    expect(document.body.style.position).toBe("");
    expect(screen.getByRole("button", { name: /notifications, 1 unread/i })).toHaveFocus();
  });

  it("returns focus to the bell from the close button", async () => {
    mockNarrow(true);
    const user = userEvent.setup();
    renderWithAuth(<NotificationBell preview={{ items, unread: 1 }} />);
    const bell = screen.getByRole("button", { name: /notifications, 1 unread/i });
    await user.click(bell);
    await user.click(screen.getByRole("button", { name: "Close notifications" }));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(bell).toHaveFocus();
  });

  it("lets the signed-in header shrink beside the bell and account pill", () => {
    renderWithAuth(
      <>
        <Header />
        <DashboardShell items={[{ to: "/app/pro", label: "Home", end: true }]} eyebrow="Priority Pro" />
      </>,
    );
    const logos = screen.getAllByRole("link", { name: /priority property pros home/i });
    expect(logos).toHaveLength(2);
    for (const logo of logos) {
      expect(logo.className).toContain("min-w-0");
      expect(logo.className).not.toContain("shrink-0");
    }
    expect(screen.getAllByRole("button", { name: /account menu/i })).toHaveLength(2);
    expect(screen.getAllByRole("button", { name: /^notifications$/i })).toHaveLength(2);
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
