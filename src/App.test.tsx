import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it } from "vitest";
import logoSvg from "./assets/logo.svg?url";
import wordmarkSvg from "./assets/wordmark.svg?url";
import App from "./App";
import { ToastProvider } from "./components/ui/Toast";
import { SERVICES } from "./data/services";

function renderApp(path = "/") {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <ToastProvider>
        <App />
      </ToastProvider>
    </MemoryRouter>,
  );
}

describe("Priority Property Pros Phase 1", () => {
  it("renders the app shell without crashing", () => {
    renderApp("/");
    expect(screen.getAllByLabelText(/priority property pros home/i).length).toBeGreaterThan(0);
  });

  it("shows the homepage customer tagline", () => {
    renderApp("/");
    const heading = screen.getByRole("heading", { level: 1 });
    expect(heading).toHaveTextContent(/your project/i);
    expect(heading).toHaveTextContent(/local pros/i);
    expect(heading).toHaveTextContent(/one simple place/i);
  });

  it("lists the Phase 1 services including Handyman and Other", () => {
    renderApp("/");
    expect(screen.getByRole("button", { name: /handyman/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /other/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /tv mounting/i })).toBeInTheDocument();
    expect(SERVICES).toHaveLength(21);
  });

  it("renders header navigation targets", () => {
    renderApp("/");
    expect(screen.getAllByRole("link", { name: /find a pro/i }).length).toBeGreaterThan(0);
    expect(screen.getAllByRole("link", { name: /how it works/i }).length).toBeGreaterThan(0);
    expect(screen.getAllByRole("link", { name: /become a pro/i }).length).toBeGreaterThan(0);
    expect(screen.getAllByRole("link", { name: /sign in/i }).length).toBeGreaterThan(0);
  });

  it("shows a polished coming-soon stub for sign-in", () => {
    renderApp("/sign-in");
    expect(screen.getByRole("heading", { name: /no accounts in phase 1/i })).toBeInTheDocument();
  });

  it("includes original brand svg assets", () => {
    expect(logoSvg).toBeTruthy();
    expect(wordmarkSvg).toBeTruthy();
  });
});
