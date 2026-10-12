import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { AuthContext } from "../../lib/auth/AuthContext";
import { signedInAuth } from "../../lib/auth/authFixture";
import { adminBreadcrumbs } from "../admin/adminNav";
import { bellBadgeLabel, notificationHistoryPath } from "./bellCopy";
import { NotificationBell } from "./NotificationBell";

const fetchAdminNeedsAttention = vi.fn();

vi.mock("../../lib/admin/dashboardApi", () => ({
  fetchAdminNeedsAttention: (...args: unknown[]) => fetchAdminNeedsAttention(...args),
}));

vi.mock("../../lib/notifications/useNotifications", () => ({
  useNotifications: () => ({
    items: [],
    unread: 0,
    ready: true,
    loadError: null,
    markRead: vi.fn(),
    markAllRead: vi.fn(),
    refresh: vi.fn(),
  }),
}));

function attentionItems(n: number) {
  return {
    generatedAt: "2026-10-11T16:40:00Z",
    includeTest: false,
    mfa: "missing",
    items: Array.from({ length: n }, (_, index) => ({
      kind: `kind-${index}`,
      count: 1,
      severity: "medium",
      link: null,
      note: `note ${index}`,
    })),
  };
}

function renderBell(type: "ADMIN" | "CUSTOMER" | "VERIFIER") {
  return render(
    <AuthContext.Provider value={signedInAuth(type)}>
      <MemoryRouter>
        <NotificationBell />
      </MemoryRouter>
    </AuthContext.Provider>,
  );
}

describe("admin notification bell", () => {
  beforeEach(() => {
    fetchAdminNeedsAttention.mockReset();
    window.matchMedia = (query: string) =>
      ({
        matches: false,
        media: query,
        onchange: null,
        addListener: () => undefined,
        removeListener: () => undefined,
        addEventListener: () => undefined,
        removeEventListener: () => undefined,
        dispatchEvent: () => false,
      }) as MediaQueryList;
  });

  it("counts the Overview attention items instead of saying all caught up", async () => {
    fetchAdminNeedsAttention.mockResolvedValue(attentionItems(3));
    const user = userEvent.setup();
    renderBell("ADMIN");
    const bell = await screen.findByRole("button", { name: "Notifications, 3 items need attention" });
    expect(bell).toHaveTextContent("3");
    await user.click(bell);
    expect(screen.getByRole("link", { name: "3 items need your attention on Overview" })).toHaveAttribute(
      "href",
      "/app/admin",
    );
    expect(screen.queryByText("You're all caught up.")).not.toBeInTheDocument();
    expect(screen.getByText("No new notifications.")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Notification history" })).toHaveAttribute(
      "href",
      "/app/admin/notifications",
    );
    expect(fetchAdminNeedsAttention).toHaveBeenCalledWith(false);
  });

  it("says all caught up when Overview has nothing", async () => {
    fetchAdminNeedsAttention.mockResolvedValue(attentionItems(0));
    const user = userEvent.setup();
    renderBell("ADMIN");
    await user.click(screen.getByRole("button", { name: "Notifications" }));
    expect(await screen.findByText("You're all caught up.")).toBeInTheDocument();
  });

  it("does not ask for admin attention on other accounts", async () => {
    const user = userEvent.setup();
    renderBell("CUSTOMER");
    await user.click(screen.getByRole("button", { name: "Notifications" }));
    expect(fetchAdminNeedsAttention).not.toHaveBeenCalled();
    expect(screen.getByRole("link", { name: "Notification history" })).toHaveAttribute(
      "href",
      "/app/customer/notifications",
    );
  });

  it("hides the history link where no history page exists", async () => {
    const user = userEvent.setup();
    renderBell("VERIFIER");
    await user.click(screen.getByRole("button", { name: "Notifications" }));
    expect(screen.queryByRole("link", { name: "Notification history" })).not.toBeInTheDocument();
  });

  it("labels and paths", () => {
    expect(bellBadgeLabel(2, 1)).toBe("Notifications, 2 unread, 1 item needs attention");
    expect(notificationHistoryPath("ADMIN")).toBe("/app/admin/notifications");
    expect(notificationHistoryPath("VERIFIER")).toBeNull();
    expect(adminBreadcrumbs("/app/admin/notifications")).toEqual([
      { label: "Overview", to: "/app/admin" },
      { label: "Notification history" },
    ]);
  });
});
