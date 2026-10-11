import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { state } = vi.hoisted(() => ({
  state: { rpc: vi.fn() },
}));

vi.mock("../../../lib/supabase/client", () => ({
  getSupabaseClient: () => ({ rpc: state.rpc }),
}));

vi.mock("../../../lib/supabase/config", () => ({
  isSupabaseConfigured: () => true,
}));

import { AdminAuditPage } from "./AdminAuditPage";

describe("admin audit log page", () => {
  beforeEach(() => {
    state.rpc.mockReset();
    state.rpc.mockResolvedValue({
      data: [
        {
          occurred_at: "2026-10-11T15:04:00.000Z",
          actor_role: "CUSTOMER",
          action: "booking.review_submitted",
          job_reference: "PPP-1042",
          summary: "CUSTOMER · rating 5",
          email: "secret@example.com",
          business_name: "Hidden Pros LLC",
          storage_path: "private/photo.jpg",
          payload: { customer: "cus_secret" },
        },
      ],
      error: null,
    });
  });

  it("filters by role, action, date, and PPP number without showing contact or identities", async () => {
    const user = userEvent.setup();
    render(<AdminAuditPage />);
    expect(screen.getByRole("heading", { name: "Audit log" })).toBeInTheDocument();
    expect(screen.getByText(/photo paths stay out of this list/i)).toBeInTheDocument();

    await user.selectOptions(screen.getByRole("combobox", { name: "Actor" }), "CUSTOMER");
    await user.type(screen.getByLabelText("Action"), "booking.review");
    await user.type(screen.getByLabelText("From"), "2026-10-01");
    await user.type(screen.getByLabelText("To"), "2026-10-11");
    await user.type(screen.getByRole("textbox", { name: /PPP number/ }), "PPP-1042");
    await user.click(screen.getByRole("button", { name: "Show events" }));

    expect(await screen.findByText("booking.review_submitted")).toBeInTheDocument();
    expect(screen.getByText("Customer · PPP-1042")).toBeInTheDocument();
    expect(screen.getByText("CUSTOMER · rating 5")).toBeInTheDocument();
    expect(screen.getByText("2026-10-11 15:04 UTC")).toBeInTheDocument();
    expect(screen.queryByText(/secret@example.com/)).not.toBeInTheDocument();
    expect(screen.queryByText(/Hidden Pros/)).not.toBeInTheDocument();
    expect(screen.queryByText(/photo.jpg/)).not.toBeInTheDocument();
    expect(screen.queryByText(/cus_secret/)).not.toBeInTheDocument();
    expect(state.rpc).toHaveBeenCalledWith("admin_list_audit_log", {
      p_actor: "CUSTOMER",
      p_action: "booking.review",
      p_from: "2026-10-01",
      p_to: "2026-10-11",
      p_reference: "PPP-1042",
      p_limit: 50,
    });
  });
});
