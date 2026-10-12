import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";
import { AuthContext } from "../lib/auth/AuthContext";
import { authValue, signedInAuth } from "../lib/auth/authFixture";
import { RequireAuth } from "../lib/auth/guards";
import {
  SIGN_IN_INVALID_MESSAGE,
  SIGN_IN_NETWORK_MESSAGE,
  SIGN_IN_RATE_LIMIT_MESSAGE,
  SIGN_IN_UNCONFIRMED_MESSAGE,
} from "../lib/auth/signInError";
import { SignInPage } from "./SignInPage";

function renderSignIn(
  value = authValue(),
  entry: { pathname: string; state?: { from?: string; notice?: string } } = { pathname: "/sign-in" },
) {
  return render(
    <AuthContext.Provider value={value}>
      <MemoryRouter initialEntries={[entry]}>
        <Routes>
          <Route path="/sign-in" element={<SignInPage />} />
          <Route path="/account/activate" element={<h1>Activate</h1>} />
          <Route element={<RequireAuth />}>
            <Route path="/app/customer" element={<h1>Customer home</h1>} />
            <Route path="/app/customer/projects/:id" element={<h1>Customer project</h1>} />
            <Route path="/app/pro" element={<h1>Pro home</h1>} />
            <Route path="/app/admin" element={<h1>Admin home</h1>} />
          </Route>
        </Routes>
      </MemoryRouter>
    </AuthContext.Provider>,
  );
}

async function fill(user: ReturnType<typeof userEvent.setup>) {
  await user.type(screen.getByLabelText(/email/i), "pat@example.com");
  await user.type(screen.getByLabelText(/^password/i), "password12");
}

describe("sign in", () => {
  it("shows inline errors for an empty form and does not call sign-in", async () => {
    const user = userEvent.setup();
    const signIn = vi.fn();
    renderSignIn(authValue({ signIn }));
    await user.click(screen.getByRole("button", { name: /^sign in$/i }));
    expect(screen.getByText(/enter your email/i)).toBeInTheDocument();
    expect(screen.getByText(/enter your password/i)).toBeInTheDocument();
    expect(signIn).not.toHaveBeenCalled();
  });

  it.each([
    ["wrong password", SIGN_IN_INVALID_MESSAGE],
    ["unconfirmed email", SIGN_IN_UNCONFIRMED_MESSAGE],
    ["too many attempts", SIGN_IN_RATE_LIMIT_MESSAGE],
    ["network", SIGN_IN_NETWORK_MESSAGE],
  ] as const)("shows a %s error", async (_label, message) => {
    const user = userEvent.setup();
    const signIn = vi.fn().mockResolvedValue({ error: message });
    renderSignIn(authValue({ signIn }));
    await fill(user);
    await user.click(screen.getByRole("button", { name: /^sign in$/i }));
    expect(await screen.findByRole("alert")).toHaveTextContent(message);
    expect(message).not.toMatch(/user not found|no account with/i);
  });

  it("tells a signed-out visitor their session expired and returns a customer to the project", () => {
    const { unmount } = renderSignIn(authValue(), {
      pathname: "/sign-in",
      state: { from: "/app/customer/projects/ppp-1004?tab=estimates", notice: "expired" },
    });
    expect(screen.getByText(/your session expired/i)).toBeInTheDocument();
    unmount();

    renderSignIn(
      signedInAuth("CUSTOMER"),
      { pathname: "/sign-in", state: { from: "/app/customer/projects/ppp-1004?tab=estimates", notice: "expired" } },
    );
    expect(screen.getByRole("heading", { name: /customer project/i })).toBeInTheDocument();
  });

  it("sends a contractor and an admin to their own homes and ignores an off-site return path", () => {
    const { unmount } = renderSignIn(signedInAuth("CONTRACTOR"), {
      pathname: "/sign-in",
      state: { from: "https://evil.example/app/admin" },
    });
    expect(screen.getByRole("heading", { name: /pro home/i })).toBeInTheDocument();
    unmount();

    renderSignIn(signedInAuth("ADMIN", { signup_fee_enabled: true, signup_fee_status: "UNPAID" }));
    expect(screen.getByRole("heading", { name: /admin home/i })).toBeInTheDocument();
  });

  it("sends an unpaid customer back through activation instead of the dashboard", () => {
    renderSignIn(signedInAuth("CUSTOMER", { signup_fee_enabled: true, signup_fee_status: "UNPAID" }), {
      pathname: "/sign-in",
      state: { from: "/app/customer" },
    });
    expect(screen.getByRole("heading", { name: /activate/i })).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: /customer home/i })).not.toBeInTheDocument();
  });
});
