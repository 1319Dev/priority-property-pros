import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it } from "vitest";
import { ToastProvider } from "../components/ui/Toast";
import { AuthProvider } from "../lib/auth/AuthProvider";
import { NEW_TO_PPP } from "../lib/marketplace/publicDirectory";
import App from "../App";

function renderApp(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <AuthProvider>
        <ToastProvider>
          <App />
        </ToastProvider>
      </AuthProvider>
    </MemoryRouter>,
  );
}

describe("Find a Pro public browse", () => {
  it("shows anonymized demo cards, filters, and View Profile CTAs", async () => {
    const user = userEvent.setup();
    renderApp("/find-a-pro");
    expect(screen.getByRole("heading", { name: /browse local independents/i })).toBeInTheDocument();
    expect(screen.getAllByText(/view profile/i).length).toBeGreaterThan(0);
    expect(screen.getByLabelText(/service/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/general area/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/^rating$/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/experience/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/sort/i)).toBeInTheDocument();
    expect(screen.getByText(/no paid placement/i)).toBeInTheDocument();
    expect(screen.getByText(NEW_TO_PPP)).toBeInTheDocument();
    await user.selectOptions(screen.getByLabelText(/sort/i), "highest_rated");
    expect(screen.getByRole("link", { name: /example fence pro/i })).toBeInTheDocument();
    expect(screen.queryByText(/512-555|@|joesfence|license number/i)).not.toBeInTheDocument();
  });

  it("opens a labeled DEMO/EXAMPLE profile with reviews and no private contact", async () => {
    renderApp("/find-a-pro/example/example-fence-pro");
    expect(screen.getAllByText(/example \/ demo/i).length).toBeGreaterThan(0);
    expect(screen.getByRole("heading", { name: /example fence pro/i })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: /^about$/i })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: /^services$/i })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: /^experience$/i })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: /^credentials$/i })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: /^portfolio$/i })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: /^reviews$/i })).toBeInTheDocument();
    expect(screen.getByText(/example review/i)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /sign up to connect/i })).toBeInTheDocument();
    expect(screen.getAllByRole("link", { name: /post a project/i }).length).toBeGreaterThan(0);
    expect(screen.queryByText(/@|512-555|www\.|instagram/i)).not.toBeInTheDocument();
  });

  it("shows New to Priority Property Pros on the zero-review demo profile", () => {
    renderApp("/find-a-pro/example/example-lawn-care-pro");
    expect(screen.getAllByText(NEW_TO_PPP).length).toBeGreaterThan(0);
    expect(screen.getByText(/no example reviews yet/i)).toBeInTheDocument();
  });
});
