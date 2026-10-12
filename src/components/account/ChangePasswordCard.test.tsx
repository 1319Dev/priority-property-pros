import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { ChangePasswordCard } from "./ChangePasswordCard";

describe("ChangePasswordCard", () => {
  it("asks for the current password and changes it", async () => {
    const user = userEvent.setup();
    const deps = { verifyCurrent: vi.fn().mockResolvedValue({ error: null }), update: vi.fn().mockResolvedValue({ error: null }) };
    render(<ChangePasswordCard email="home@example.com" deps={deps} />);
    await user.click(screen.getByRole("button", { name: "Change password" }));
    expect(screen.getByLabelText("Current password")).toHaveAttribute("autocomplete", "current-password");
    await user.type(screen.getByLabelText("Current password"), "old-password");
    await user.type(screen.getByLabelText("New password"), "1234567");
    await user.type(screen.getByLabelText("Confirm new password"), "1234567");
    await user.click(screen.getByRole("button", { name: "Save new password" }));
    expect(screen.getByText("Use at least 8 characters.")).toBeInTheDocument();
    expect(deps.update).not.toHaveBeenCalled();

    await user.type(screen.getByLabelText("New password"), "8");
    await user.type(screen.getByLabelText("Confirm new password"), "8");
    await user.click(screen.getByRole("button", { name: "Save new password" }));
    expect(await screen.findByRole("status")).toHaveTextContent("Your password was changed.");
    expect(deps.verifyCurrent).toHaveBeenCalledWith("home@example.com", "old-password");
    expect(deps.update).toHaveBeenCalledWith("12345678", "old-password");
  });
});
