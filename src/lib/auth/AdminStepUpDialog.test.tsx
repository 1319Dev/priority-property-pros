import { act, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { state } = vi.hoisted(() => ({
  state: {
    listFactors: vi.fn(),
    challenge: vi.fn(),
    verify: vi.fn(),
    getAuthenticatorAssuranceLevel: vi.fn(),
  },
}));

vi.mock("../supabase/client", () => ({
  getSupabaseClient: () => ({
    auth: {
      mfa: {
        listFactors: state.listFactors,
        challenge: state.challenge,
        verify: state.verify,
        getAuthenticatorAssuranceLevel: state.getAuthenticatorAssuranceLevel,
      },
    },
  }),
}));

import { AdminStepUpHost } from "./AdminStepUpDialog";
import { registerAdminStepUpHandler, requestAdminStepUp } from "./adminStepUp";

describe("admin step-up dialog", () => {
  beforeEach(() => {
    registerAdminStepUpHandler(null);
    state.listFactors.mockReset();
    state.challenge.mockReset();
    state.verify.mockReset();
    state.listFactors.mockResolvedValue({
      data: {
        all: [
          {
            id: "phone",
            friendly_name: "Phone",
            factor_type: "totp",
            status: "verified",
            created_at: "2026-10-01T00:00:00Z",
          },
          {
            id: "backup",
            friendly_name: "Backup tablet",
            factor_type: "totp",
            status: "verified",
            created_at: "2026-10-02T00:00:00Z",
          },
        ],
        totp: [],
      },
      error: null,
    });
    state.challenge.mockResolvedValue({ data: { id: "challenge-1" }, error: null });
    state.verify.mockResolvedValue({ data: {}, error: null });
  });

  it("accepts a code from the backup authenticator and continues", async () => {
    const user = userEvent.setup();
    render(<AdminStepUpHost />);
    let pending!: Promise<boolean>;
    act(() => {
      pending = requestAdminStepUp();
    });
    expect(await screen.findByRole("combobox")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Confirm this admin action" })).toBeInTheDocument();
    expect(screen.getByText(/needs a code from the last 15 minutes/i)).toBeInTheDocument();
    expect(screen.getByText(/backup authenticator works here too/i)).toBeInTheDocument();

    await user.selectOptions(screen.getByRole("combobox"), "backup");
    await user.type(screen.getByLabelText("6-digit code"), "654321");
    await user.click(screen.getByRole("button", { name: "Verify and continue" }));

    await expect(pending).resolves.toBe(true);
    expect(state.challenge).toHaveBeenCalledWith({ factorId: "backup" });
    expect(state.verify).toHaveBeenCalledWith({
      factorId: "backup",
      challengeId: "challenge-1",
      code: "654321",
    });
  });

  it("cancels without verifying", async () => {
    const user = userEvent.setup();
    render(<AdminStepUpHost />);
    let pending!: Promise<boolean>;
    act(() => {
      pending = requestAdminStepUp();
    });
    await screen.findByRole("heading", { name: "Confirm this admin action" });
    await user.click(screen.getByRole("button", { name: "Cancel" }));
    await expect(pending).resolves.toBe(false);
    expect(state.verify).not.toHaveBeenCalled();
  });
});
