import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { state } = vi.hoisted(() => ({
  state: {
    rpc: vi.fn(),
    enroll: vi.fn(),
    challenge: vi.fn(),
    verify: vi.fn(),
    unenroll: vi.fn(),
    listFactors: vi.fn(),
    getAuthenticatorAssuranceLevel: vi.fn(),
  },
}));

vi.mock("../../../lib/supabase/client", () => ({
  getSupabaseClient: () => ({
    rpc: state.rpc,
    auth: {
      mfa: {
        enroll: state.enroll,
        challenge: state.challenge,
        verify: state.verify,
        unenroll: state.unenroll,
        listFactors: state.listFactors,
        getAuthenticatorAssuranceLevel: state.getAuthenticatorAssuranceLevel,
      },
    },
  }),
}));

import { AdminTwoFactorPage } from "./AdminTwoFactorPage";

const phone = {
  id: "phone-1",
  friendly_name: "Phone",
  factor_type: "totp" as const,
  status: "verified" as const,
  created_at: "2026-10-01T00:00:00Z",
  updated_at: "2026-10-01T00:00:00Z",
};

function listed(factors: (typeof phone)[]) {
  state.listFactors.mockResolvedValue({
    data: { all: factors, totp: factors.filter((factor) => factor.status === "verified"), phone: [] },
    error: null,
  });
}

describe("admin authenticator enrollment", () => {
  beforeEach(() => {
    state.rpc.mockReset();
    state.enroll.mockReset();
    state.challenge.mockReset();
    state.verify.mockReset();
    state.unenroll.mockReset();
    state.listFactors.mockReset();
    state.getAuthenticatorAssuranceLevel.mockReset();
    state.rpc.mockResolvedValue({ data: false, error: null });
    state.getAuthenticatorAssuranceLevel.mockResolvedValue({
      data: { currentLevel: "aal1", nextLevel: "aal1", currentAuthenticationMethods: [] },
      error: null,
    });
    listed([]);
    state.unenroll.mockResolvedValue({ data: { id: "new-1" }, error: null });
  });

  it("shows a QR code and secret, then verifies the first code", async () => {
    const user = userEvent.setup();
    state.enroll.mockResolvedValue({
      data: {
        id: "new-1",
        type: "totp",
        friendly_name: "Phone",
        totp: { qr_code: "<svg>qr</svg>", secret: "SECRET123", uri: "otpauth://totp/example" },
      },
      error: null,
    });
    state.challenge.mockResolvedValue({ data: { id: "ch-1" }, error: null });
    state.verify.mockResolvedValue({ data: { access_token: "aal2" }, error: null });

    render(<AdminTwoFactorPage />);
    expect(await screen.findByRole("heading", { name: "Two-factor sign-in" })).toBeInTheDocument();
    expect(screen.getByText(/second device is the backup/i)).toBeInTheDocument();
    expect(screen.getByText(/Add a backup authenticator/i)).toBeInTheDocument();

    await user.type(screen.getByRole("textbox", { name: /device name/i }), "Phone");
    await user.click(screen.getByRole("button", { name: "Set up authenticator" }));

    expect(await screen.findByRole("img", { name: "Authenticator QR code" })).toHaveAttribute(
      "src",
      expect.stringContaining("data:image/svg+xml"),
    );
    expect(screen.getByLabelText("Authenticator secret")).toHaveValue("SECRET123");
    expect(state.enroll).toHaveBeenCalledWith({
      factorType: "totp",
      friendlyName: "Phone",
      issuer: "Priority Property Pros",
    });

    listed([phone]);
    state.getAuthenticatorAssuranceLevel.mockResolvedValue({
      data: { currentLevel: "aal2", nextLevel: "aal2", currentAuthenticationMethods: [] },
      error: null,
    });
    await user.type(screen.getByLabelText("6-digit code"), "123456");
    await user.click(screen.getByRole("button", { name: "Verify and save" }));

    expect(await screen.findByText("Phone")).toBeInTheDocument();
    expect(state.challenge).toHaveBeenCalledWith({ factorId: "new-1" });
    expect(state.verify).toHaveBeenCalledWith({ factorId: "new-1", challengeId: "ch-1", code: "123456" });
    expect(screen.getByText(/Add a backup authenticator/i)).toBeInTheDocument();
  });

  it("shows a wrong-code error and keeps the secret on screen", async () => {
    const user = userEvent.setup();
    state.enroll.mockResolvedValue({
      data: {
        id: "new-1",
        type: "totp",
        totp: { qr_code: "<svg>qr</svg>", secret: "SECRET123", uri: "otpauth://totp/example" },
      },
      error: null,
    });
    state.challenge.mockResolvedValue({ data: { id: "ch-1" }, error: null });
    state.verify.mockResolvedValue({
      data: null,
      error: { code: "mfa_verification_failed", message: "Invalid TOTP code entered" },
    });

    render(<AdminTwoFactorPage />);
    await user.type(await screen.findByRole("textbox", { name: /device name/i }), "Phone");
    await user.click(screen.getByRole("button", { name: "Set up authenticator" }));
    await user.type(await screen.findByLabelText("6-digit code"), "000000");
    await user.click(screen.getByRole("button", { name: "Verify and save" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(/didn't match/i);
    expect(screen.getByLabelText("Authenticator secret")).toHaveValue("SECRET123");
  });

  it("does not offer removal of the last factor when enforcement is on", async () => {
    state.rpc.mockResolvedValue({ data: true, error: null });
    state.getAuthenticatorAssuranceLevel.mockResolvedValue({
      data: { currentLevel: "aal2", nextLevel: "aal2", currentAuthenticationMethods: [] },
      error: null,
    });
    listed([phone]);

    render(<AdminTwoFactorPage />);
    const remove = await screen.findByRole("button", { name: "Remove" });
    expect(remove).toBeDisabled();
    expect(screen.getByText(/last authenticator/i)).toBeInTheDocument();
    expect(state.unenroll).not.toHaveBeenCalled();
  });

  it("removes a backup device at aal2 when another factor remains", async () => {
    const user = userEvent.setup();
    const tablet = { ...phone, id: "tablet-1", friendly_name: "Backup tablet" };
    state.rpc.mockResolvedValue({ data: true, error: null });
    state.getAuthenticatorAssuranceLevel.mockResolvedValue({
      data: { currentLevel: "aal2", nextLevel: "aal2", currentAuthenticationMethods: [] },
      error: null,
    });
    let listCalls = 0;
    state.listFactors.mockImplementation(async () => {
      listCalls += 1;
      const factors = listCalls < 3 ? [phone, tablet] : [phone];
      return {
        data: { all: factors, totp: factors, phone: [] },
        error: null,
      };
    });
    state.unenroll.mockResolvedValue({ data: { id: "tablet-1" }, error: null });

    render(<AdminTwoFactorPage />);
    const removeButtons = await screen.findAllByRole("button", { name: "Remove" });
    expect(removeButtons).toHaveLength(2);
    await user.click(removeButtons[1]);
    await user.click(screen.getByRole("button", { name: "Confirm removal" }));

    expect(state.unenroll).toHaveBeenCalledWith({ factorId: "tablet-1" });
    expect(await screen.findByRole("button", { name: "Remove" })).toBeDisabled();
  });
});
