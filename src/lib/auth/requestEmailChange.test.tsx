import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { AuthProvider } from "./AuthProvider";
import { useAuth } from "./useAuth";

const mocks = vi.hoisted(() => ({
  signInWithPassword: vi.fn(),
  updateUser: vi.fn(),
}));

vi.mock("../supabase/client", () => ({
  isSupabaseConfigured: () => true,
  getSupabaseClient: () => ({
    auth: {
      getSession: async () => ({
        data: {
          session: {
            user: { id: "user-1", email: "pat@example.com" },
          },
        },
      }),
      onAuthStateChange: () => ({ data: { subscription: { unsubscribe: () => undefined } } }),
      signInWithPassword: mocks.signInWithPassword,
      updateUser: mocks.updateUser,
    },
    from: () => ({
      select: () => ({
        eq: () => ({
          maybeSingle: async () => ({
            data: {
              id: "user-1",
              email: "pat@example.com",
              first_name: "Pat",
              last_name: "Lee",
              phone: null,
              avatar_url: null,
              account_type: "CUSTOMER",
              account_status: "ACTIVE",
              created_at: "2026-01-01T00:00:00Z",
              updated_at: "2026-01-01T00:00:00Z",
            },
            error: null,
          }),
        }),
      }),
    }),
  }),
  getSupabaseRecoveryRequestClient: () => ({ auth: {} }),
}));

vi.mock("../signupFee/api", () => ({
  fetchSignupFeeCheckoutFlags: async () => ({ enabled: false }),
}));

function Probe() {
  const { requestEmailChange, user } = useAuth();
  return (
    <>
      <p>{user?.email ?? "signed-out"}</p>
      <button
        type="button"
        onClick={() =>
          void requestEmailChange?.(" next@example.com ", "secret").then((result) => {
            const node = document.getElementById("email-result");
            if (node) node.textContent = result.error ?? "ok";
          })
        }
      >
        Change
      </button>
      <p id="email-result" />
    </>
  );
}

describe("requestEmailChange", () => {
  beforeEach(() => {
    mocks.signInWithPassword.mockReset();
    mocks.updateUser.mockReset();
    mocks.signInWithPassword.mockResolvedValue({ data: {}, error: null });
    mocks.updateUser.mockResolvedValue({ data: { user: null }, error: null });
  });

  it("rechecks the current password, then asks Auth to confirm the new address", async () => {
    const user = userEvent.setup();
    render(
      <AuthProvider>
        <Probe />
      </AuthProvider>,
    );
    await screen.findByText("pat@example.com");
    await user.click(screen.getByRole("button", { name: "Change" }));
    await waitFor(() => {
      expect(document.getElementById("email-result")?.textContent).toBe("ok");
    });
    expect(mocks.signInWithPassword).toHaveBeenCalledWith({ email: "pat@example.com", password: "secret" });
    expect(mocks.updateUser).toHaveBeenCalledWith(
      { email: "next@example.com" },
      { emailRedirectTo: expect.stringMatching(/\/auth\/callback$/) },
    );
    const reauthOrder = mocks.signInWithPassword.mock.invocationCallOrder[0] ?? 0;
    const updateOrder = mocks.updateUser.mock.invocationCallOrder[0] ?? 0;
    expect(reauthOrder).toBeLessThan(updateOrder);
  });

  it("does not call updateUser when the current password is rejected", async () => {
    mocks.signInWithPassword.mockResolvedValue({
      data: {},
      error: { message: "Invalid login credentials", code: "invalid_credentials", status: 400 },
    });
    const user = userEvent.setup();
    render(
      <AuthProvider>
        <Probe />
      </AuthProvider>,
    );
    await screen.findByText("pat@example.com");
    await user.click(screen.getByRole("button", { name: "Change" }));
    await waitFor(() => {
      expect(document.getElementById("email-result")?.textContent).toMatch(/current password/i);
    });
    expect(mocks.updateUser).not.toHaveBeenCalled();
  });
});
