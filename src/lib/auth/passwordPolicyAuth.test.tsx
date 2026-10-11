import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { AuthProvider } from "./AuthProvider";
import { PASSWORD_TOO_SHORT_MESSAGE } from "./passwordPolicy";
import { useAuth } from "./useAuth";

const mocks = vi.hoisted(() => ({
  signUp: vi.fn(),
  updateUser: vi.fn(),
}));

vi.mock("../supabase/client", () => ({
  isSupabaseConfigured: () => true,
  getSupabaseClient: () => ({
    auth: {
      getSession: async () => ({ data: { session: null } }),
      onAuthStateChange: () => ({ data: { subscription: { unsubscribe: () => undefined } } }),
      signUp: mocks.signUp,
      updateUser: mocks.updateUser,
    },
    from: () => ({ select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: null, error: null }) }) }) }),
  }),
  getSupabaseRecoveryRequestClient: () => ({ auth: {} }),
}));

function Probe() {
  const { signUp, updatePassword } = useAuth();
  return (
    <>
      <button
        type="button"
        onClick={() =>
          void signUp({
            email: "pat@example.com",
            password: "short",
            firstName: "Pat",
            lastName: "Lee",
            phone: "",
            accountType: "CUSTOMER",
            acceptedTerms: true,
          }).then((result) => {
            const node = document.getElementById("signup-result");
            if (node) node.textContent = result.error ?? "ok";
          })
        }
      >
        Sign up short
      </button>
      <button
        type="button"
        onClick={() =>
          void signUp({
            email: "pat@example.com",
            password: "longenough",
            firstName: "Pat",
            lastName: "Lee",
            phone: "",
            accountType: "CUSTOMER",
            acceptedTerms: true,
          })
        }
      >
        Sign up ok
      </button>
      <button
        type="button"
        onClick={() =>
          void updatePassword("short").then((result) => {
            const node = document.getElementById("password-result");
            if (node) node.textContent = result.error ?? "ok";
          })
        }
      >
        Update short
      </button>
      <p id="signup-result" />
      <p id="password-result" />
    </>
  );
}

describe("AuthProvider password length", () => {
  beforeEach(() => {
    mocks.signUp.mockReset();
    mocks.updateUser.mockReset();
    mocks.signUp.mockResolvedValue({ data: { user: { id: "1" }, session: null }, error: null });
    mocks.updateUser.mockResolvedValue({ data: { user: null }, error: null });
  });

  it("blocks a short signup password before calling Supabase", async () => {
    const user = userEvent.setup();
    render(
      <AuthProvider>
        <Probe />
      </AuthProvider>,
    );
    await user.click(screen.getByRole("button", { name: "Sign up short" }));
    await waitFor(() => {
      expect(screen.getByText(PASSWORD_TOO_SHORT_MESSAGE)).toBeInTheDocument();
    });
    expect(mocks.signUp).not.toHaveBeenCalled();
  });

  it("still calls Supabase when the password is long enough", async () => {
    const user = userEvent.setup();
    render(
      <AuthProvider>
        <Probe />
      </AuthProvider>,
    );
    await user.click(screen.getByRole("button", { name: "Sign up ok" }));
    await waitFor(() => {
      expect(mocks.signUp).toHaveBeenCalledWith(
        expect.objectContaining({ email: "pat@example.com", password: "longenough" }),
      );
    });
  });

  it("blocks a short password change before calling Supabase", async () => {
    const user = userEvent.setup();
    render(
      <AuthProvider>
        <Probe />
      </AuthProvider>,
    );
    await user.click(screen.getByRole("button", { name: "Update short" }));
    await waitFor(() => {
      expect(document.getElementById("password-result")?.textContent).toBe(PASSWORD_TOO_SHORT_MESSAGE);
    });
    expect(mocks.updateUser).not.toHaveBeenCalled();
  });
});
