import { render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { AuthContext } from "../lib/auth/AuthContext";
import { authValue } from "../lib/auth/authFixture";
import { fetchLegalAcceptanceRequired } from "../lib/legal/acceptanceApi";
import { SignUpPage } from "./SignUpPage";

vi.mock("../lib/legal/acceptanceApi", () => ({
  fetchLegalAcceptanceRequired: vi.fn(),
}));

function renderSignup() {
  return render(
    <AuthContext.Provider value={authValue()}>
      <MemoryRouter initialEntries={["/sign-up/customer"]}>
        <Routes>
          <Route path="/sign-up/:role" element={<SignUpPage />} />
        </Routes>
      </MemoryRouter>
    </AuthContext.Provider>,
  );
}

describe("signup age affirmation", () => {
  beforeEach(() => {
    vi.mocked(fetchLegalAcceptanceRequired).mockReset();
  });

  it("does not show or require the 18+ checkbox while acceptance is off", async () => {
    vi.mocked(fetchLegalAcceptanceRequired).mockResolvedValue(false);
    renderSignup();
    expect(await screen.findByRole("heading", { name: /create a customer account/i })).toBeInTheDocument();
    await waitFor(() => expect(fetchLegalAcceptanceRequired).toHaveBeenCalled());
    expect(screen.queryByRole("checkbox", { name: /18 or older/i })).not.toBeInTheDocument();
    expect(screen.getByRole("checkbox", { name: /i agree to/i })).toBeRequired();
  });

  it("asks for an 18+ affirmation only when acceptance is required", async () => {
    vi.mocked(fetchLegalAcceptanceRequired).mockResolvedValue(true);
    renderSignup();
    expect(await screen.findByRole("checkbox", { name: /18 or older/i })).toBeRequired();
    expect(screen.getByRole("checkbox", { name: /i agree to/i })).toBeRequired();
  });
});
