import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { MFA_EXPIRED_CODE, MFA_RATE_LIMIT, MFA_WRONG_CODE } from "./adminMfa";
import { AdminMfaChallenge } from "./AdminMfaChallenge";

const factors = [
  { id: "phone-1", friendlyName: "Phone" },
  { id: "tablet-1", friendlyName: "Backup tablet" },
];

describe("admin authenticator challenge", () => {
  it("asks for a 6-digit code and offers sign out before admin pages", async () => {
    const user = userEvent.setup();
    const onSignOut = vi.fn();
    const onVerify = vi.fn().mockResolvedValue({ error: null });
    render(<AdminMfaChallenge factors={[factors[0]]} onVerify={onVerify} onSignOut={onSignOut} />);

    expect(screen.getByRole("heading", { name: "Enter your authenticator code." })).toBeInTheDocument();
    expect(screen.getByText(/password reset/i)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Verify" })).toBeDisabled();

    await user.type(screen.getByLabelText("6-digit code"), "123456");
    await user.click(screen.getByRole("button", { name: "Verify" }));
    expect(onVerify).toHaveBeenCalledWith("phone-1", "123456");

    await user.click(screen.getByRole("button", { name: "Sign out" }));
    expect(onSignOut).toHaveBeenCalled();
  });

  it("shows friendly errors for a wrong code, an expired challenge, and a rate limit", async () => {
    const user = userEvent.setup();
    const onVerify = vi
      .fn()
      .mockResolvedValueOnce({ error: MFA_WRONG_CODE })
      .mockResolvedValueOnce({ error: MFA_EXPIRED_CODE })
      .mockResolvedValueOnce({ error: MFA_RATE_LIMIT });
    render(<AdminMfaChallenge factors={[factors[0]]} onVerify={onVerify} onSignOut={vi.fn()} />);

    for (const message of [MFA_WRONG_CODE, MFA_EXPIRED_CODE, MFA_RATE_LIMIT]) {
      await user.type(screen.getByLabelText("6-digit code"), "000000");
      await user.click(screen.getByRole("button", { name: "Verify" }));
      expect(await screen.findByRole("alert")).toHaveTextContent(message);
    }
  });

  it("lets the admin pick which enrolled device to use", async () => {
    const user = userEvent.setup();
    const onVerify = vi.fn().mockResolvedValue({ error: null });
    render(<AdminMfaChallenge factors={factors} onVerify={onVerify} onSignOut={vi.fn()} />);

    await user.selectOptions(screen.getByRole("combobox", { name: "Authenticator" }), "tablet-1");
    await user.type(screen.getByLabelText("6-digit code"), "654321");
    await user.click(screen.getByRole("button", { name: "Verify" }));
    expect(onVerify).toHaveBeenCalledWith("tablet-1", "654321");
  });
});
