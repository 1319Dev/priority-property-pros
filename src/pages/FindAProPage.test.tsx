import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it } from "vitest";
import { ToastProvider } from "../components/ui/Toast";
import { SUPPORT_EMAIL } from "../data/brand";
import { AuthProvider } from "../lib/auth/AuthProvider";
import { FIND_A_PRO_DOCUMENT_TITLE, FIND_A_PRO_EMPTY_TITLE, FIND_A_PRO_TITLE } from "../lib/marketplace/findAPro";
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

describe("Find a Pro page", () => {
  it("lists the public directory instead of a review-only preview", () => {
    renderApp("/find-a-pro");
    expect(document.title).toBe(FIND_A_PRO_DOCUMENT_TITLE);
    expect(screen.getByRole("heading", { name: FIND_A_PRO_TITLE })).toBeInTheDocument();
    expect(screen.getByText(FIND_A_PRO_EMPTY_TITLE)).toBeInTheDocument();
    expect(screen.getByText(/contact details stay private until you and a pro connect on a project/i)).toBeInTheDocument();
    expect(screen.queryByText(/\$4\.99 connection fee/i)).not.toBeInTheDocument();
    expect(screen.getByText(/does not take a cut of the job/i)).toBeInTheDocument();
    expect(screen.getByRole("textbox", { name: /^service/i })).toBeInTheDocument();
    expect(screen.getByRole("textbox", { name: /^area/i })).toBeInTheDocument();
    expect(screen.queryByText(/not a directory/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/loading live directory/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/show labeled example cards/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/example fence pro/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/smoke tester/i)).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: /view profile/i })).not.toBeInTheDocument();
    expect(document.body.innerHTML).not.toMatch(/tel:/i);
  });

  it("does not publish labeled example people", () => {
    renderApp("/find-a-pro/example/example-fence-pro");
    expect(screen.getByRole("heading", { name: FIND_A_PRO_TITLE })).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: /example fence pro/i })).not.toBeInTheDocument();
    expect(screen.queryByText(/example \/ demo/i)).not.toBeInTheDocument();
  });

  it("does not open a contractor who is outside the public directory", () => {
    renderApp("/find-a-pro/11111111-1111-4111-8111-111111111111");
    expect(screen.getByRole("heading", { name: /profile not listed/i })).toBeInTheDocument();
    expect(screen.queryByText(/public directory you can message/i)).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: /sign up to connect|invite|request estimate/i })).not.toBeInTheDocument();
    expect(document.title).toBe(FIND_A_PRO_DOCUMENT_TITLE);
  });
});

describe("Public contact email", () => {
  it("uses the Priority Property Pros support address", () => {
    renderApp("/contact");
    expect(screen.getAllByRole("link", { name: SUPPORT_EMAIL }).length).toBeGreaterThan(0);
    expect(screen.getAllByRole("link", { name: SUPPORT_EMAIL })[0]).toHaveAttribute("href", `mailto:${SUPPORT_EMAIL}`);
    expect(SUPPORT_EMAIL).toBe("support@prioritypropertypros.com");
    expect(screen.queryByText(/hello@example.com/i)).not.toBeInTheDocument();
  });
});
