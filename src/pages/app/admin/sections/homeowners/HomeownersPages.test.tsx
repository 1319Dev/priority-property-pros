import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { mockAdminViewport } from "../../../../../test/adminViewport";
import type { HomeownerDetail, HomeownerList } from "../../../../../lib/admin/homeownersApi";
import { HomeownerDetailPage, HomeownersLayout } from "./HomeownersPages";

const fetchHomeowners = vi.fn();
const fetchHomeowner = vi.fn();

vi.mock("../../../../../lib/admin/homeownersApi", async () => {
  const actual = await vi.importActual<typeof import("../../../../../lib/admin/homeownersApi")>(
    "../../../../../lib/admin/homeownersApi",
  );
  return {
    ...actual,
    fetchHomeowners: (...args: unknown[]) => fetchHomeowners(...args),
    fetchHomeowner: (...args: unknown[]) => fetchHomeowner(...args),
  };
});

const list: HomeownerList = {
  total: 1,
  rows: [
    {
      profileId: "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb",
      displayName: "Owen Home",
      email: "owen@example.com",
      accountStatus: "ACTIVE",
      signupFeeStatus: "PAID",
      projectCount: 1,
      flag: null,
      flagNote: null,
      createdAt: "2026-10-02T15:00:00.000Z",
    },
  ],
};

const detail: HomeownerDetail = {
  ...list.rows[0],
  projects: [
    {
      projectId: "11111111-1111-1111-1111-111111111111",
      referenceNumber: 1004,
      title: "Fence stain",
      status: "POSTED",
      city: "Conroe",
      postedAt: "2026-10-04T15:00:00.000Z",
    },
  ],
  payments: [
    {
      chargeId: "44444444-4444-4444-4444-444444444444",
      kind: "activation",
      amountCents: 999,
      status: "CONSUMED",
      livemode: true,
      createdAt: "2026-10-04T18:00:00.000Z",
      fulfilledAt: "2026-10-04T18:00:00.000Z",
      needsRefund: false,
      refundReason: null,
    },
  ],
};

function renderHomeowners(entry: string) {
  return render(
    <MemoryRouter initialEntries={[entry]}>
      <Routes>
        <Route path="/app/admin/homeowners" element={<HomeownersLayout />}>
          <Route index element={null} />
          <Route path=":profileId" element={<HomeownerDetailPage />} />
        </Route>
      </Routes>
    </MemoryRouter>,
  );
}

describe("homeowners directory", () => {
  beforeEach(() => {
    localStorage.clear();
    fetchHomeowners.mockReset();
    fetchHomeowner.mockReset();
    fetchHomeowners.mockResolvedValue(list);
    fetchHomeowner.mockResolvedValue(detail);
  });

  it("searches and hides write actions on a phone", async () => {
    mockAdminViewport(390);
    const user = userEvent.setup();
    renderHomeowners("/app/admin/homeowners");
    expect(await screen.findByRole("link", { name: /Owen Home/ })).toBeInTheDocument();
    expect(screen.getByText("owen@example.com")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /suspend|restore|refund|mark paid|delete/i })).not.toBeInTheDocument();
    await user.type(screen.getByRole("textbox", { name: /search homeowners/i }), "Owen");
    await waitFor(() => expect(fetchHomeowners).toHaveBeenCalledWith(expect.objectContaining({ query: "Owen", includeTest: false })));
  });

  it("opens the detail as its own screen at 390px", async () => {
    mockAdminViewport(390);
    const user = userEvent.setup();
    renderHomeowners("/app/admin/homeowners");
    await user.click(await screen.findByRole("link", { name: /Owen Home/ }));
    expect(await screen.findByRole("heading", { name: "Owen Home" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "PPP-1004" })).toHaveAttribute("href", "/app/admin/bookings?ref=PPP-1004");
    expect(screen.getByText(/\$9\.99/)).toBeInTheDocument();
    expect(screen.getByText(/Conroe/)).toBeInTheDocument();
    expect(screen.queryByText(/404-555/)).not.toBeInTheDocument();
    expect(screen.queryByText(/street/i)).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: /Owen Home/ })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /suspend|restore|refund|mark paid/i })).not.toBeInTheDocument();
  });

  it("keeps the list beside the detail at 1280px", async () => {
    mockAdminViewport(1280);
    renderHomeowners("/app/admin/homeowners/bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb");
    expect(await screen.findByRole("heading", { name: "Owen Home" })).toBeInTheDocument();
    expect(screen.getByRole("region", { name: "Homeowners" })).toBeInTheDocument();
    expect(screen.getByRole("region", { name: "Homeowner" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Owen Home/ })).toBeInTheDocument();
  });
});
