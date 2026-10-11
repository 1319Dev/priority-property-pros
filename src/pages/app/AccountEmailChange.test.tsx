import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ReactNode } from "react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";
import { AuthContext } from "../../lib/auth/AuthContext";
import { EMAIL_CHANGE_SENT_MESSAGE } from "../../lib/auth/emailChange";
import { signedInAuth } from "../../lib/auth/authFixture";
import { AccountPage } from "./CustomerPages";

function renderAccount(type: "CUSTOMER" | "CONTRACTOR" | "ADMIN", extra: Parameters<typeof signedInAuth>[1] = {}) {
  const requestEmailChange = vi.fn(async () => ({ error: null }));
  const value = signedInAuth(type, { requestEmailChange, ...extra });
  function wrap(ui: ReactNode) {
    return render(
      <AuthContext.Provider value={value}>
        <MemoryRouter>{ui}</MemoryRouter>
      </AuthContext.Provider>,
    );
  }
  return { requestEmailChange, ...wrap(<AccountPage />) };
}

describe("AccountPage email change", () => {
  it("shows the form for a customer and a contractor and hides it for an admin", () => {
    const customer = renderAccount("CUSTOMER");
    expect(screen.getByRole("heading", { name: /change email/i })).toBeInTheDocument();
    expect(screen.getByLabelText(/new email/i)).toHaveClass("w-full");
    customer.unmount();

    const contractor = renderAccount("CONTRACTOR");
    expect(screen.getByRole("heading", { name: /change email/i })).toBeInTheDocument();
    contractor.unmount();

    renderAccount("ADMIN");
    expect(screen.queryByRole("heading", { name: /change email/i })).not.toBeInTheDocument();
  });

  it("does not call Auth when the new email is empty", async () => {
    const user = userEvent.setup();
    const { requestEmailChange } = renderAccount("CUSTOMER");
    await user.click(screen.getByRole("button", { name: /send confirmation/i }));
    expect(requestEmailChange).not.toHaveBeenCalled();
    expect(screen.getByText(/enter the new email/i)).toBeInTheDocument();
  });

  it("asks Auth to email both addresses and shows a pending address", async () => {
    const user = userEvent.setup();
    const { requestEmailChange } = renderAccount("CONTRACTOR", {
      user: { id: "user-1", email: "pat@example.com", new_email: "next@example.com" } as never,
    });
    expect(screen.getByText("next@example.com")).toBeInTheDocument();
    await user.type(screen.getByLabelText(/new email/i), "other@example.com");
    await user.type(screen.getByLabelText(/current password/i), "correct-horse");
    await user.click(screen.getByRole("button", { name: /send confirmation/i }));
    expect(requestEmailChange).toHaveBeenCalledWith("other@example.com", "correct-horse");
    expect(await screen.findByText(EMAIL_CHANGE_SENT_MESSAGE)).toBeInTheDocument();
  });
});
