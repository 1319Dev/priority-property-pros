import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { AuthProvider } from "./AuthProvider";
import { useAuth } from "./useAuth";

const mocks = vi.hoisted(() => ({
  resetPasswordForEmail: vi.fn(),
  mainResetPasswordForEmail: vi.fn(),
}));

vi.mock("../supabase/client", () => ({
  isSupabaseConfigured: () => true,
  getSupabaseClient: () => ({
    auth: {
      getSession: async () => ({ data: { session: null } }),
      onAuthStateChange: () => ({ data: { subscription: { unsubscribe: () => undefined } } }),
      resetPasswordForEmail: mocks.mainResetPasswordForEmail,
    },
  }),
  getSupabaseRecoveryRequestClient: () => ({
    auth: {
      resetPasswordForEmail: mocks.resetPasswordForEmail,
    },
  }),
}));

function Sender() {
  const { requestPasswordReset } = useAuth();
  return (
    <button type="button" onClick={() => void requestPasswordReset("  person@example.com  ")}>
      Send reset
    </button>
  );
}

describe("requestPasswordReset", () => {
  beforeEach(() => {
    mocks.resetPasswordForEmail.mockReset();
    mocks.mainResetPasswordForEmail.mockReset();
    mocks.resetPasswordForEmail.mockResolvedValue({ data: {}, error: null });
  });

  it("uses the implicit recovery client and redirects to /auth/reset-password", async () => {
    const user = userEvent.setup();
    render(
      <AuthProvider>
        <Sender />
      </AuthProvider>,
    );

    await user.click(screen.getByRole("button", { name: "Send reset" }));

    await waitFor(() => {
      expect(mocks.resetPasswordForEmail).toHaveBeenCalledWith("person@example.com", {
        redirectTo: expect.stringMatching(/\/auth\/reset-password$/),
      });
    });
    expect(mocks.mainResetPasswordForEmail).not.toHaveBeenCalled();
  });
});
