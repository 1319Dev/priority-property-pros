import { render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { AuthCallbackPage } from "./AuthCallbackPage";

const api = vi.hoisted(() => ({
  verifyOtp: vi.fn(),
  exchangeCodeForSession: vi.fn(),
  refreshProfile: vi.fn(async () => undefined),
}));

vi.mock("../lib/supabase/client", () => ({
  getSupabaseClient: () => ({
    auth: {
      verifyOtp: api.verifyOtp,
      exchangeCodeForSession: api.exchangeCodeForSession,
    },
  }),
}));

vi.mock("../lib/auth/useAuth", () => ({
  useAuth: () => ({
    refreshProfile: api.refreshProfile,
    account_type: null,
    account_status: null,
    signup_fee_enabled: false,
    signup_fee_status: null,
    loading: true,
    user: null,
  }),
}));

describe("AuthCallbackPage", () => {
  beforeEach(() => {
    api.verifyOtp.mockReset();
    api.exchangeCodeForSession.mockReset();
    api.refreshProfile.mockClear();
    window.history.replaceState(null, "", "/auth/callback");
  });

  it("verifies token_hash with the type from the URL", async () => {
    window.history.replaceState(null, "", "/auth/callback?token_hash=hashed-token&type=signup");
    api.verifyOtp.mockResolvedValue({ data: {}, error: null });

    render(
      <MemoryRouter>
        <AuthCallbackPage />
      </MemoryRouter>,
    );

    await waitFor(() => {
      expect(api.verifyOtp).toHaveBeenCalledWith({ token_hash: "hashed-token", type: "signup" });
    });
    expect(api.exchangeCodeForSession).not.toHaveBeenCalled();
    expect(screen.getByText(/Finishing sign-in…/)).toBeInTheDocument();
  });

  it("still exchanges a PKCE code", async () => {
    window.history.replaceState(null, "", "/auth/callback?code=auth-code");
    api.exchangeCodeForSession.mockResolvedValue({ data: {}, error: null });

    render(
      <MemoryRouter>
        <AuthCallbackPage />
      </MemoryRouter>,
    );

    await waitFor(() => {
      expect(api.exchangeCodeForSession).toHaveBeenCalledWith("auth-code");
    });
    expect(api.verifyOtp).not.toHaveBeenCalled();
  });

  it("verifies an email-change link", async () => {
    window.history.replaceState(null, "", "/auth/callback?token_hash=hashed-token&type=email_change");
    api.verifyOtp.mockResolvedValue({ data: {}, error: null });

    render(
      <MemoryRouter>
        <AuthCallbackPage />
      </MemoryRouter>,
    );

    await waitFor(() => {
      expect(api.verifyOtp).toHaveBeenCalledWith({ token_hash: "hashed-token", type: "email_change" });
    });
  });
});
