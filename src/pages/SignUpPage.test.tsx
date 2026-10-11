import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { SIGNUP_TERMS_ACCEPTANCE } from "../data/pricing";
import { AuthContext } from "../lib/auth/AuthContext";
import { authValue, signedInAuth } from "../lib/auth/authFixture";
import { SignUpPage } from "./SignUpPage";
import { SignUpRolePage } from "./SignUpRolePage";

vi.mock("../lib/signupFee/api", () => ({
  fetchSignupFeeCheckoutFlags: vi.fn().mockResolvedValue({ enabled: false }),
}));

function renderSignup(path: string, value = authValue()) {
  return render(
    <AuthContext.Provider value={value}>
      <MemoryRouter initialEntries={[path]}>
        <Routes>
          <Route path="/sign-up" element={<SignUpRolePage />} />
          <Route path="/sign-up/:role" element={<SignUpPage />} />
          <Route path="/app/customer" element={<h1>Customer home</h1>} />
          <Route path="/app/pro" element={<h1>Pro home</h1>} />
          <Route path="/app/admin" element={<h1>Admin home</h1>} />
          <Route path="/account/activate" element={<h1>Activate</h1>} />
          <Route path="/auth/verify" element={<h1>Verify email</h1>} />
        </Routes>
      </MemoryRouter>
    </AuthContext.Provider>,
  );
}

describe("signup screens", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("shows full role phrases and the activation difference to a signed-out visitor", () => {
    renderSignup("/sign-up");
    const customer = screen.getByRole("link", { name: /i need work done/i });
    const contractor = screen.getByRole("link", { name: /i want to get hired/i });
    expect(customer).toHaveAttribute("data-auth-card", "");
    expect(customer.className).toContain("w-full");
    expect(customer.className).toContain("flex-col");
    expect(contractor.className).toContain("flex-col");
    expect(screen.getByRole("heading", { name: /before checkout/i })).toBeInTheDocument();
    expect(screen.getByText(/customer and contractor accounts pay that same one-time activation/i)).toBeInTheDocument();
    expect(screen.getAllByText(/\$9\.99 account activation fee is non-refundable/i).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/no PPP Connection Fee/i).length).toBeGreaterThan(0);
    expect(screen.getByText(/\$4\.99 only when they choose to connect/i)).toBeInTheDocument();
  });

  it("shows inline field errors instead of submitting an empty customer form", async () => {
    const user = userEvent.setup();
    const signUp = vi.fn();
    renderSignup("/sign-up/customer", authValue({ signUp }));
    await user.click(screen.getByRole("button", { name: /create account/i }));
    expect(screen.getAllByText(/enter your first name/i).length).toBeGreaterThan(0);
    expect(screen.getByLabelText(/confirm password/i)).toBeInTheDocument();
    expect(screen.getByRole("alert")).toHaveTextContent(/enter your email/i);
    expect(signUp).not.toHaveBeenCalled();
    expect(screen.getByLabelText(/first name/i)).toHaveAttribute("aria-invalid", "true");
  });

  it("rejects a mismatched confirm password before calling signup", async () => {
    const user = userEvent.setup();
    const signUp = vi.fn();
    renderSignup("/sign-up/customer", authValue({ signUp }));
    await user.type(screen.getByLabelText(/first name/i), "Pat");
    await user.type(screen.getByLabelText(/last name/i), "Lee");
    await user.type(screen.getByLabelText(/^email$/i), "pat@example.com");
    await user.type(screen.getByLabelText(/^password/i), "password12");
    await user.type(screen.getByLabelText(/confirm password/i), "password13");
    await user.click(screen.getByRole("button", { name: /create account/i }));
    expect(screen.getAllByText(/do not match/i).length).toBeGreaterThan(0);
    expect(signUp).not.toHaveBeenCalled();
  });

  it("keeps the existing agreement checkbox and explains the customer fee before checkout", () => {
    renderSignup("/sign-up/customer");
    expect(screen.getByRole("checkbox")).toBeRequired();
    expect(screen.getByText(SIGNUP_TERMS_ACCEPTANCE)).toBeInTheDocument();
    expect(screen.getAllByText(/creating an account does not charge you/i).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/checkout is not live yet/i).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/no PPP Connection Fee/i).length).toBeGreaterThan(0);
  });

  it("explains the contractor account without changing the $4.99 or $9.99 fees", async () => {
    const user = userEvent.setup();
    const signUp = vi.fn().mockResolvedValue({ error: null, needsEmailConfirm: true });
    renderSignup("/sign-up/contractor", authValue({ signUp }));
    expect(screen.getByText(/independent pros who want to get hired/i)).toBeInTheDocument();
    expect(screen.getByText(/\$4\.99 Connection Fee is non-refundable/i)).toBeInTheDocument();
    await user.type(screen.getByLabelText(/first name/i), "Pat");
    await user.type(screen.getByLabelText(/last name/i), "Lee");
    await user.type(screen.getByLabelText(/^email$/i), "pat@example.com");
    await user.type(screen.getByLabelText(/^password/i), "password12");
    await user.type(screen.getByLabelText(/confirm password/i), "password12");
    await user.click(screen.getByRole("checkbox"));
    await user.click(screen.getByRole("button", { name: /create account/i }));
    expect(screen.getAllByText(/enter your business name/i).length).toBeGreaterThan(0);
    expect(signUp).not.toHaveBeenCalled();
  });

  it("sends a signed-in customer away from customer signup and lets them open contractor signup", () => {
    const { unmount } = renderSignup("/sign-up/customer", signedInAuth("CUSTOMER"));
    expect(screen.getByRole("heading", { name: /customer home/i })).toBeInTheDocument();
    unmount();
    renderSignup("/sign-up/contractor", signedInAuth("CUSTOMER"));
    expect(screen.getByRole("heading", { name: /apply as an independent contractor/i })).toBeInTheDocument();
  });

  it("sends a signed-in contractor and an admin away from signup", () => {
    const { unmount } = renderSignup("/sign-up", signedInAuth("CONTRACTOR"));
    expect(screen.getByRole("heading", { name: /pro home/i })).toBeInTheDocument();
    unmount();
    renderSignup("/sign-up/contractor", signedInAuth("ADMIN"));
    expect(screen.getByRole("heading", { name: /admin home/i })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /create account/i })).not.toBeInTheDocument();
  });

  it("sends an unpaid customer to activation when the signup fee is on", () => {
    renderSignup(
      "/sign-up/customer",
      signedInAuth("CUSTOMER", { signup_fee_enabled: true, signup_fee_status: "UNPAID" }),
    );
    expect(screen.getByRole("heading", { name: /activate/i })).toBeInTheDocument();
  });
});
