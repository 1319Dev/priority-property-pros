import { fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MIN_FILL_MS, TOO_FAST_MESSAGE, evaluateBotGuard } from "./botGuard";
import { ForgotPasswordPage } from "../../pages/ForgotPasswordPage";
import { SignInPage } from "../../pages/SignInPage";

const api = vi.hoisted(() => ({
  requestPasswordReset: vi.fn(async () => ({ error: null, status: null })),
  signIn: vi.fn(async () => ({ error: null })),
  refreshProfile: vi.fn(async () => undefined),
}));

vi.mock("../auth/useAuth", () => ({
  useAuth: () => ({
    requestPasswordReset: api.requestPasswordReset,
    signIn: api.signIn,
    refreshProfile: api.refreshProfile,
    configured: true,
    loading: false,
    user: null,
    account_type: null,
    account_status: null,
    signup_fee_enabled: false,
    signup_fee_status: null,
  }),
}));

describe("evaluateBotGuard", () => {
  it("silently drops a filled honeypot", () => {
    expect(evaluateBotGuard({ form: "signUp", honeypotValue: "http://spam", startedAtMs: 0, nowMs: 99_999 })).toEqual({
      ok: false,
      reason: "honeypot",
      silent: true,
    });
  });

  it("asks once more when the form is submitted faster than a person can fill it", () => {
    const verdict = evaluateBotGuard({ form: "signUp", honeypotValue: "", startedAtMs: 1000, nowMs: 1000 + MIN_FILL_MS.signUp - 1 });
    expect(verdict).toMatchObject({ ok: false, reason: "too_fast", message: TOO_FAST_MESSAGE });
    expect(evaluateBotGuard({ form: "signUp", honeypotValue: "", startedAtMs: 1000, nowMs: 1000 + MIN_FILL_MS.signUp })).toEqual({ ok: true });
  });

  it("never applies a minimum time to sign-in, so password managers keep working", () => {
    expect(MIN_FILL_MS.signIn).toBe(0);
    expect(evaluateBotGuard({ form: "signIn", honeypotValue: "", startedAtMs: 5, nowMs: 5 })).toEqual({ ok: true });
  });
});

describe("auth forms use the guard before calling Supabase", () => {
  let now = 1_000_000;
  beforeEach(() => {
    now = 1_000_000;
    vi.spyOn(Date, "now").mockImplementation(() => now);
    api.requestPasswordReset.mockClear();
    api.signIn.mockClear();
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("hides the honeypot from people and assistive tech", () => {
    render(<MemoryRouter><ForgotPasswordPage /></MemoryRouter>);
    const trap = screen.getByTestId("honeypot");
    expect(trap).toHaveAttribute("tabindex", "-1");
    expect(trap.closest("[aria-hidden='true']")).not.toBeNull();
  });

  it("password reset: honeypot shows the normal confirmation without sending anything", () => {
    render(<MemoryRouter><ForgotPasswordPage /></MemoryRouter>);
    fireEvent.change(screen.getByLabelText("Email"), { target: { value: "bot@example.com" } });
    fireEvent.change(screen.getByTestId("honeypot"), { target: { value: "spam" } });
    now += 10_000;
    fireEvent.submit(screen.getByLabelText("Email").closest("form")!);
    expect(api.requestPasswordReset).not.toHaveBeenCalled();
    expect(screen.getByText(/reset link is on the way/i)).toBeInTheDocument();
  });

  it("password reset: too-fast submit asks again, then the second press sends", async () => {
    render(<MemoryRouter><ForgotPasswordPage /></MemoryRouter>);
    fireEvent.change(screen.getByLabelText("Email"), { target: { value: "pat@example.com" } });
    const form = screen.getByLabelText("Email").closest("form")!;
    fireEvent.submit(form);
    expect(api.requestPasswordReset).not.toHaveBeenCalled();
    expect(screen.getByText(TOO_FAST_MESSAGE)).toBeInTheDocument();
    now += MIN_FILL_MS.passwordReset;
    fireEvent.submit(form);
    expect(api.requestPasswordReset).toHaveBeenCalledWith("pat@example.com");
    expect(await screen.findByText(/reset link is on the way/i)).toBeInTheDocument();
  });

  it("sign-in: honeypot never calls Supabase", () => {
    render(<MemoryRouter><SignInPage /></MemoryRouter>);
    fireEvent.change(screen.getByTestId("honeypot"), { target: { value: "spam" } });
    fireEvent.submit(screen.getByTestId("honeypot").closest("form")!);
    expect(api.signIn).not.toHaveBeenCalled();
  });
});
