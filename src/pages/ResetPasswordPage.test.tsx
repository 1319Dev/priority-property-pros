import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { AuthContext } from "../lib/auth/AuthContext";
import { authValue } from "../lib/auth/authFixture";
import type { AuthContextValue } from "../lib/auth/AuthContext";
import { captureRecoveryLink, resetRecoveryLinkStateForTests } from "../lib/auth/recoveryLink";
import { ResetPasswordPage } from "./ResetPasswordPage";

const authApi = vi.hoisted(() => ({
  setSession: vi.fn(),
  verifyOtp: vi.fn(),
  exchangeCodeForSession: vi.fn(),
  getSession: vi.fn(),
  onAuthStateChange: vi.fn(() => ({ data: { subscription: { unsubscribe: vi.fn() } } })),
}));

vi.mock("../lib/supabase/client", () => ({
  getSupabaseClient: () => ({ auth: authApi }),
  isSupabaseConfigured: () => true,
}));

function page(auth: Partial<AuthContextValue> = {}) {
  return (
    <AuthContext.Provider value={authValue({ configured: true, loading: false, user: null, ...auth })}>
      <MemoryRouter>
        <ResetPasswordPage />
      </MemoryRouter>
    </AuthContext.Provider>
  );
}

describe("ResetPasswordPage", () => {
  beforeEach(() => {
    resetRecoveryLinkStateForTests();
    authApi.setSession.mockReset();
    authApi.verifyOtp.mockReset();
    authApi.exchangeCodeForSession.mockReset();
    authApi.getSession.mockReset();
    authApi.onAuthStateChange.mockClear();
    authApi.getSession.mockResolvedValue({ data: { session: null } });
    authApi.onAuthStateChange.mockImplementation(() => ({ data: { subscription: { unsubscribe: vi.fn() } } }));
    window.history.replaceState(null, "", "/auth/reset-password");
  });

  it("shows the new-password form after setSession from a hash", async () => {
    window.history.replaceState(null, "", "/auth/reset-password#access_token=access-token&refresh_token=refresh-token&type=recovery");
    captureRecoveryLink(window.location.search, window.location.hash);
    authApi.setSession.mockResolvedValue({ data: { session: {}, user: {} }, error: null });

    render(page());

    expect(await screen.findByLabelText(/new password/i)).toBeInTheDocument();
    expect(authApi.setSession).toHaveBeenCalledWith({
      access_token: "access-token",
      refresh_token: "refresh-token",
    });
    expect(window.location.hash).toBe("");
    expect(window.location.href).not.toContain("access-token");
    expect(window.location.href).not.toContain("refresh-token");
    expect(screen.queryByText(/missing or expired/i)).not.toBeInTheDocument();
  });

  it("shows Checking while the reset link is still being verified", () => {
    captureRecoveryLink("", "#access_token=access-token&refresh_token=refresh-token&type=recovery");
    authApi.setSession.mockReturnValue(new Promise(() => undefined));

    render(page());

    expect(screen.getByText(/Checking your reset link…/)).toBeInTheDocument();
    expect(screen.queryByLabelText(/new password/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/missing or expired/i)).not.toBeInTheDocument();
  });

  it("keeps Checking until auth loading finishes, then shows the expired reason", () => {
    captureRecoveryLink("", "#error=access_denied&error_code=otp_expired&error_description=Email+link+is+invalid+or+has+expired");
    const { rerender } = render(page({ loading: true }));

    expect(screen.getByText(/Checking your reset link…/)).toBeInTheDocument();
    expect(screen.queryByText(/missing or expired/i)).not.toBeInTheDocument();

    rerender(page({ loading: false }));

    expect(screen.getByText(/This reset link is missing or expired\. Email link is invalid or has expired/)).toBeInTheDocument();
    expect(screen.getByLabelText(/^email$/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Send a new link" })).toBeInTheDocument();
    expect(authApi.setSession).not.toHaveBeenCalled();
    expect(authApi.verifyOtp).not.toHaveBeenCalled();
  });

  it("verifies a token_hash with the recovery type", async () => {
    captureRecoveryLink("?token_hash=hashed-token&type=recovery", "");
    authApi.verifyOtp.mockResolvedValue({ data: { session: {}, user: {} }, error: null });

    render(page());

    expect(await screen.findByLabelText(/new password/i)).toBeInTheDocument();
    expect(authApi.verifyOtp).toHaveBeenCalledWith({ token_hash: "hashed-token", type: "recovery" });
  });

  it("explains a code opened in a different browser", async () => {
    captureRecoveryLink("?code=auth-code", "");
    authApi.exchangeCodeForSession.mockResolvedValue({
      data: { session: null, user: null },
      error: { message: "PKCE code verifier not found in storage.", code: "pkce_code_verifier_not_found" },
    });

    render(page());

    expect(await screen.findByText(/opened in a different browser than the one that asked for it/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Send a new link" })).toBeInTheDocument();
  });

  it("shows a plain-language rate limit when asking for another link", async () => {
    captureRecoveryLink("?error=access_denied&error_description=Expired", "");
    const requestPasswordReset = vi.fn().mockResolvedValue({ error: "Email rate limit exceeded", status: 429 });
    const user = userEvent.setup();

    render(page({ requestPasswordReset }));
    await user.type(screen.getByLabelText(/^email$/i), "pat@example.com");
    await user.click(screen.getByRole("button", { name: "Send a new link" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("Please wait a minute before asking for another link");
    expect(requestPasswordReset).toHaveBeenCalledWith("pat@example.com");
  });
});
