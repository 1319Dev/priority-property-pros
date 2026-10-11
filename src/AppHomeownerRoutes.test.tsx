import { render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import { describe, expect, it } from "vitest";
import App from "./App";
import { ToastProvider } from "./components/ui/Toast";
import { AuthContext } from "./lib/auth/AuthContext";
import { authValue, profileFor } from "./lib/auth/authFixture";

function Probe() {
  const location = useLocation();
  return <output data-testid="path">{location.pathname}</output>;
}

describe("homeowner short links", () => {
  it("/app/customer/blocked opens Blocked pros instead of a 404", async () => {
    const profile = profileFor("CUSTOMER");
    render(
      <MemoryRouter initialEntries={["/app/customer/blocked"]}>
        <AuthContext.Provider
          value={authValue({ user: { id: profile.id } as never, profile, account_type: "CUSTOMER", account_status: "ACTIVE" })}
        >
          <ToastProvider>
            <App />
            <Routes>
              <Route path="*" element={<Probe />} />
            </Routes>
          </ToastProvider>
        </AuthContext.Provider>
      </MemoryRouter>,
    );
    expect(await screen.findByRole("heading", { name: "Blocked pros" })).toBeInTheDocument();
    expect(screen.getByTestId("path")).toHaveTextContent("/app/customer/account/blocked");
  });
});
