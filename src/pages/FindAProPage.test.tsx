import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it } from "vitest";
import { ToastProvider } from "../components/ui/Toast";
import { SUPPORT_EMAIL } from "../data/brand";
import { AuthProvider } from "../lib/auth/AuthProvider";
import { REVIEWED_PROS_EMPTY_TITLE, REVIEWED_PROS_TITLE } from "../lib/marketplace/reviewedContractors";
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

describe("Reviewed contractor preview", () => {
  it("shows an empty review preview instead of a live directory", () => {
    renderApp("/find-a-pro");
    expect(screen.getByRole("heading", { name: REVIEWED_PROS_TITLE })).toBeInTheDocument();
    expect(screen.getByText(REVIEWED_PROS_EMPTY_TITLE)).toBeInTheDocument();
    expect(screen.getByText(/not a directory/i)).toBeInTheDocument();
    expect(screen.getByText(/\$4\.99 connection fee/i)).toBeInTheDocument();
    expect(screen.getAllByText(/does not take a cut of the job/i).length).toBeGreaterThan(0);
    expect(screen.queryByText(/loading live directory/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/browse local independents/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/show labeled example cards/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/example fence pro/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/smoke tester/i)).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: /view profile/i })).not.toBeInTheDocument();
    expect(screen.queryByLabelText(/^service$/i)).not.toBeInTheDocument();
  });

  it("does not publish labeled example people", () => {
    renderApp("/find-a-pro/example/example-fence-pro");
    expect(screen.getByRole("heading", { name: REVIEWED_PROS_TITLE })).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: /example fence pro/i })).not.toBeInTheDocument();
    expect(screen.queryByText(/example \/ demo/i)).not.toBeInTheDocument();
  });

  it("does not open a contractor who has no public review", () => {
    renderApp("/find-a-pro/11111111-1111-4111-8111-111111111111");
    expect(screen.getByRole("heading", { name: /no public review/i })).toBeInTheDocument();
    expect(screen.queryByText(/public directory/i)).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: /sign up to connect/i })).not.toBeInTheDocument();
  });
});

describe("Public contact email", () => {
  it("uses the Priority Property Pros Gmail address", () => {
    renderApp("/contact");
    expect(screen.getAllByRole("link", { name: SUPPORT_EMAIL }).length).toBeGreaterThan(0);
    expect(screen.getAllByRole("link", { name: SUPPORT_EMAIL })[0]).toHaveAttribute("href", `mailto:${SUPPORT_EMAIL}`);
    expect(SUPPORT_EMAIL).toBe("prioritypropertypros@gmail.com");
    expect(screen.queryByText(/hello@example.com/i)).not.toBeInTheDocument();
  });
});
