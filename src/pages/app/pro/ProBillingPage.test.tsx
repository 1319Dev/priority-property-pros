import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ProBillingPage } from "./ProBillingPage";
import { ProShell } from "../ProShell";

const auth = vi.hoisted(() => ({
  value: {
    user: { id: "user-1" },
    profile: { id: "user-1", first_name: "Garrett", last_name: "Plymate", email: "g@example.com", signup_fee_status: "NOT_REQUIRED", signup_fee_paid_at: null },
    account_type: "CONTRACTOR",
    account_status: "ACTIVE",
  } as Record<string, unknown>,
}));
const billing = vi.hoisted(() => ({ rows: vi.fn() }));

vi.mock("../../../lib/auth/useAuth", () => ({ useAuth: () => auth.value }));
vi.mock("../../../lib/marketplace/api", () => ({
  fetchContractorProfileByUser: vi.fn(async () => ({ id: "cp-1" })),
}));
vi.mock("../../../lib/billing/proBilling", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../../lib/billing/proBilling")>();
  return { ...actual, fetchProBillingRows: (...args: unknown[]) => billing.rows(...args) };
});
vi.mock("../../../lib/marketplace/useMessageUnread", () => ({ useMessageUnreadCount: () => 0 }));
vi.mock("../../../components/notifications/NotificationBell", () => ({ NotificationBell: () => null }));
vi.mock("../../../components/account/AccountMenu", () => ({ AccountMenu: () => null }));
vi.mock("../../../components/marketplace/HowFeesWork", () => ({ HowFeesWork: () => null }));

describe("contractor billing page", () => {
  beforeEach(() => {
    billing.rows.mockReset();
  });

  it("lists the paid $4.99 Connect for PPP-1004 and the waived activation, read-only", async () => {
    billing.rows.mockResolvedValue([
      { id: "connect-c1", kind: "connect", label: "Connect", date: "2026-10-04T23:17:56Z", jobRef: "PPP-1004", amountCents: 499, status: "Paid", charged: true, testMode: false },
      { id: "connect-c2", kind: "connect", label: "Connect", date: "2026-10-03T13:00:00Z", jobRef: null, amountCents: 499, status: "Cancelled · not charged", charged: false, testMode: false },
    ]);
    render(
      <MemoryRouter>
        <ProBillingPage />
      </MemoryRouter>,
    );
    expect(await screen.findByText("Connect · PPP-1004")).toBeInTheDocument();
    expect(billing.rows).toHaveBeenCalledWith({ profileId: "user-1", contractorProfileId: "cp-1" });
    expect(screen.getByText("Oct 4, 2026")).toBeInTheDocument();
    expect(screen.getByText("Paid")).toBeInTheDocument();
    expect(screen.getByText("Connect · Job ref unavailable")).toBeInTheDocument();
    expect(screen.getByText("Cancelled · not charged")).toBeInTheDocument();
    expect(screen.getByText("$4.99", { selector: "span" })).toBeInTheDocument();
    expect(screen.getByText("Waived · no $9.99 activation charge on this account")).toBeInTheDocument();
    expect(screen.getAllByText("Receipt link not stored by PPP")).toHaveLength(2);
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });

  it("shows an empty state with no payments", async () => {
    billing.rows.mockResolvedValue([]);
    render(
      <MemoryRouter>
        <ProBillingPage />
      </MemoryRouter>,
    );
    expect(await screen.findByText("No payments yet")).toBeInTheDocument();
  });
});

describe("contractor navigation", () => {
  it("has Billing and no duplicate Bookings tab", () => {
    render(
      <MemoryRouter initialEntries={["/app/pro"]}>
        <ProShell />
      </MemoryRouter>,
    );
    expect(screen.getAllByRole("link", { name: /billing/i })[0]).toHaveAttribute("href", "/app/pro/billing");
    expect(screen.queryByRole("link", { name: /^bookings$/i })).not.toBeInTheDocument();
  });

  it("shows only the role on phones; the name is in a span hidden below sm", () => {
    render(
      <MemoryRouter initialEntries={["/app/pro"]}>
        <ProShell />
      </MemoryRouter>,
    );
    const name = screen.getByText("· Garrett Plymate");
    expect(name.tagName).toBe("SPAN");
    expect(name.className).toMatch(/hidden sm:inline/);
    expect(name.parentElement?.className).toMatch(/whitespace-nowrap/);
  });
});
