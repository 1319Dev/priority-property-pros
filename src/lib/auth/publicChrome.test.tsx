import { render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { describe, expect, it } from "vitest";
import { BottomNav } from "../../components/layout/BottomNav";
import { Footer } from "../../components/layout/Footer";
import { Header } from "../../components/layout/Header";
import { ForContractors } from "../../features/home/ForContractors";
import { Hero } from "../../features/home/Hero";
import { BecomeAProPage } from "../../pages/BecomeAProPage";
import { PostProjectPage } from "../../pages/PostProjectPage";
import { SignInPage } from "../../pages/SignInPage";
import { SignUpPage } from "../../pages/SignUpPage";
import { SignUpRolePage } from "../../pages/SignUpRolePage";
import { AuthContext, type AuthContextValue } from "./AuthContext";
import { authValue, signedInAuth } from "./authFixture";

function renderChrome(value: AuthContextValue, path = "/") {
  return render(
    <AuthContext.Provider value={value}>
      <MemoryRouter initialEntries={[path]}>
        <Header />
        <Hero />
        <ForContractors />
        <BecomeAProPage />
        <Footer />
        <BottomNav />
        <Routes>
          <Route path="/become-a-pro" element={<BecomeAProPage />} />
          <Route path="/post-project" element={<PostProjectPage />} />
          <Route path="/sign-in" element={<SignInPage />} />
          <Route path="/sign-up" element={<SignUpRolePage />} />
          <Route path="/sign-up/:role" element={<SignUpPage />} />
          <Route path="/app/customer" element={<h1>Customer home</h1>} />
          <Route path="/app/pro" element={<h1>Pro home</h1>} />
          <Route path="/" element={<h1>Marketing home</h1>} />
          <Route path="/app/customer/projects/new/wizard" element={<h1>Project wizard</h1>} />
        </Routes>
      </MemoryRouter>
    </AuthContext.Provider>,
  );
}

function proSignupLinks() {
  return screen.queryAllByRole("link", { name: /become a pro|become a priority pro|^pros$/i });
}

describe("auth-aware public chrome", () => {
  it("keeps Sign in and pro signup for signed-out visitors", () => {
    renderChrome(authValue());
    expect(screen.getAllByRole("link", { name: /^sign in$/i }).length).toBeGreaterThan(0);
    expect(proSignupLinks().length).toBeGreaterThan(0);
    expect(proSignupLinks().some((link) => link.getAttribute("href") === "/become-a-pro")).toBe(true);
    expect(
      screen.getAllByRole("link", { name: /become a priority pro/i }).some((link) => link.getAttribute("href") === "/sign-up/contractor"),
    ).toBe(true);
    expect(screen.getAllByRole("link", { name: /post a project/i })[0]).toHaveAttribute("href", "/post-project");
    expect(screen.queryByRole("link", { name: /my dashboard/i })).not.toBeInTheDocument();
  });

  it("replaces pro signup with the contractor dashboard and hides customer signup", () => {
    renderChrome(signedInAuth("CONTRACTOR"), "/post-project");
    expect(proSignupLinks()).toHaveLength(0);
    expect(
      screen.getAllByRole("link").some((link) => (link.getAttribute("href") ?? "").includes("/sign-up/contractor")),
    ).toBe(false);
    expect(screen.queryByRole("link", { name: /create a customer account/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: /^sign in$/i })).not.toBeInTheDocument();
    const dashboards = screen.getAllByRole("link", { name: /my dashboard/i });
    expect(dashboards.length).toBeGreaterThan(0);
    expect(dashboards.every((link) => link.getAttribute("href") === "/app/pro")).toBe(true);
    expect(screen.getByRole("link", { name: /^dashboard$/i })).toHaveAttribute("href", "/app/pro");
  });

  it("keeps Become a Pro for a signed-in customer and sends Post a project to the wizard", () => {
    renderChrome(signedInAuth("CUSTOMER"), "/post-project");
    expect(proSignupLinks().length).toBeGreaterThan(0);
    expect(
      screen.getAllByRole("link", { name: /become a priority pro/i }).some((link) => link.getAttribute("href") === "/sign-up/contractor"),
    ).toBe(true);
    expect(screen.queryByRole("link", { name: /create a customer account/i })).not.toBeInTheDocument();
    expect(screen.getByRole("heading", { name: /project wizard/i })).toBeInTheDocument();
    expect(screen.getAllByRole("link", { name: /my dashboard/i }).some((link) => link.getAttribute("href") === "/app/customer")).toBe(
      true,
    );
  });

  it("does not flash Sign in or Become a Pro while the session is loading", () => {
    renderChrome(authValue({ loading: true }));
    expect(screen.queryByRole("link", { name: /^sign in$/i })).not.toBeInTheDocument();
    expect(proSignupLinks()).toHaveLength(0);
    expect(screen.getAllByRole("status", { name: "Loading…" }).length).toBeGreaterThan(0);
  });

  it("sends a signed-in visitor away from sign-in and generic sign-up", () => {
    const { unmount } = renderChrome(signedInAuth("CUSTOMER"), "/sign-in");
    expect(screen.getByRole("heading", { name: /customer home/i })).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: /welcome back/i })).not.toBeInTheDocument();
    unmount();

    renderChrome(signedInAuth("CONTRACTOR"), "/sign-up");
    expect(screen.getByRole("heading", { name: /pro home/i })).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: /i want to get hired/i })).not.toBeInTheDocument();
  });

  it("lets a signed-in customer open contractor signup", () => {
    renderChrome(signedInAuth("CUSTOMER", { configured: false }), "/sign-up/contractor");
    expect(screen.getByRole("heading", { name: /apply as an independent contractor/i })).toBeInTheDocument();
  });
});
