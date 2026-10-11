import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ReactNode } from "react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";
import { AuthContext, type AuthContextValue } from "../../lib/auth/AuthContext";
import type { LegalDocument } from "../../lib/legal/catalog";
import { AgreementAcceptancePrompt } from "./AgreementAcceptancePrompt";

const gap: LegalDocument = {
  slug: "terms-of-use",
  title: "Terms of Use",
  version: 3,
  path: "/terms",
  audience: "ALL",
};

function authValue(): AuthContextValue {
  return {
    configured: true,
    loading: false,
    user: { id: "user-1", email: "pat@example.com" } as AuthContextValue["user"],
    session: null,
    profile: null,
    account_type: "CUSTOMER",
    account_status: "ACTIVE",
    signup_fee_status: null,
    signup_fee_enabled: false,
    signIn: async () => ({ error: null }),
    signUp: async () => ({ error: null, needsEmailConfirm: true }),
    signOut: async () => undefined,
    refreshProfile: async () => undefined,
    requestPasswordReset: async () => ({ error: null }),
    updatePassword: async () => ({ error: null }),
    resendVerification: async () => ({ error: null }),
  };
}

function renderPrompt(ui: ReactNode) {
  return render(
    <AuthContext.Provider value={authValue()}>
      <MemoryRouter>{ui}</MemoryRouter>
    </AuthContext.Provider>,
  );
}

describe("agreement acceptance prompt", () => {
  it("stays hidden when the legal pages are unpublished", () => {
    const acceptanceRequired = vi.fn<() => Promise<boolean>>().mockResolvedValue(true);
    const load = vi.fn();
    renderPrompt(
      <>
        <AgreementAcceptancePrompt published={false} acceptanceRequired={acceptanceRequired} load={load} />
        <p>Project data</p>
      </>,
    );
    expect(screen.getByText("Project data")).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: /please accept the current agreements/i })).not.toBeInTheDocument();
    expect(acceptanceRequired).not.toHaveBeenCalled();
    expect(load).not.toHaveBeenCalled();
  });

  it("stays hidden when the platform setting is off", async () => {
    const acceptanceRequired = vi.fn<() => Promise<boolean>>().mockResolvedValue(false);
    const load = vi.fn<() => Promise<LegalDocument[] | null>>().mockResolvedValue([gap]);
    renderPrompt(
      <>
        <AgreementAcceptancePrompt published acceptanceRequired={acceptanceRequired} load={load} />
        <p>Project data</p>
      </>,
    );
    expect(await screen.findByText("Project data")).toBeInTheDocument();
    await waitFor(() => expect(acceptanceRequired).toHaveBeenCalled());
    expect(load).not.toHaveBeenCalled();
    expect(screen.queryByRole("heading", { name: /please accept the current agreements/i })).not.toBeInTheDocument();
  });

  it("asks for acceptance without hiding the account data", async () => {
    const user = userEvent.setup();
    const acceptanceRequired = vi.fn<() => Promise<boolean>>().mockResolvedValue(true);
    const load = vi.fn<() => Promise<LegalDocument[] | null>>()
      .mockResolvedValueOnce([gap])
      .mockResolvedValueOnce([]);
    const accept = vi.fn().mockResolvedValue({ error: null });
    renderPrompt(
      <>
        <AgreementAcceptancePrompt published acceptanceRequired={acceptanceRequired} load={load} accept={accept} />
        <p>Project data</p>
      </>,
    );

    expect(await screen.findByRole("heading", { name: /please accept the current agreements/i })).toBeInTheDocument();
    expect(screen.getByText("Project data")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /terms of use/i })).toHaveAttribute("href", "/terms");
    expect(screen.getByRole("button", { name: /^accept$/i })).toBeDisabled();

    await user.click(screen.getByRole("checkbox", { name: /i agree to the agreements listed above/i }));
    await user.click(screen.getByRole("button", { name: /^accept$/i }));

    expect(accept).toHaveBeenCalledOnce();
    expect(screen.getByText("Project data")).toBeInTheDocument();
    await waitFor(() => {
      expect(screen.queryByRole("heading", { name: /please accept the current agreements/i })).not.toBeInTheDocument();
    });
  });

  it("does not block the page when the acceptance check cannot run", async () => {
    const acceptanceRequired = vi.fn<() => Promise<boolean>>().mockResolvedValue(true);
    const load = vi.fn<() => Promise<LegalDocument[] | null>>().mockResolvedValue(null);
    renderPrompt(
      <>
        <AgreementAcceptancePrompt published acceptanceRequired={acceptanceRequired} load={load} />
        <p>Project data</p>
      </>,
    );
    expect(await screen.findByText("Project data")).toBeInTheDocument();
    await waitFor(() => expect(load).toHaveBeenCalled());
    expect(screen.queryByRole("heading", { name: /please accept the current agreements/i })).not.toBeInTheDocument();
  });

  it("does not block the page when the setting check fails", async () => {
    const acceptanceRequired = vi.fn<() => Promise<boolean>>().mockRejectedValue(new Error("missing rpc"));
    const load = vi.fn();
    renderPrompt(
      <>
        <AgreementAcceptancePrompt published acceptanceRequired={acceptanceRequired} load={load} />
        <p>Project data</p>
      </>,
    );
    expect(await screen.findByText("Project data")).toBeInTheDocument();
    await waitFor(() => expect(acceptanceRequired).toHaveBeenCalled());
    expect(load).not.toHaveBeenCalled();
    expect(screen.queryByRole("heading", { name: /please accept the current agreements/i })).not.toBeInTheDocument();
  });
});
