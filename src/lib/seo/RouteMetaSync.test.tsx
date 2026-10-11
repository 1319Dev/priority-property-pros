import { act, render } from "@testing-library/react";
import { MemoryRouter, Route, Routes, useNavigate } from "react-router-dom";
import { describe, expect, it } from "vitest";
import { ToastProvider } from "../../components/ui/Toast";
import { NotFoundPage } from "../../pages/NotFoundPage";
import { AuthProvider } from "../auth/AuthProvider";
import { RouteMetaSync } from "./RouteMetaSync";
import { usePageTitle } from "./usePageTitle";

let go: (to: string) => void = () => {};
function Nav() {
  go = useNavigate();
  return null;
}
function OwnTitle() {
  usePageTitle("Handyman pro in Conroe | Priority Property Pros");
  return null;
}

function renderAt(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <AuthProvider>
        <ToastProvider>
          <RouteMetaSync />
          <Nav />
          <Routes>
            <Route path="/find-a-pro/:id" element={<OwnTitle />} />
            <Route path="/pricing" element={<p>pricing</p>} />
            <Route path="/app/admin" element={<p>admin</p>} />
            <Route path="*" element={<NotFoundPage />} />
          </Routes>
        </ToastProvider>
      </AuthProvider>
    </MemoryRouter>,
  );
}

const canonical = () =>
  document.head.querySelector('link[rel="canonical"]')?.getAttribute("href");
const robots = () =>
  document.head.querySelector('meta[name="robots"]')?.getAttribute("content") ??
  null;

describe("RouteMetaSync", () => {
  it("updates title, description, canonical, and robots on navigation", () => {
    renderAt("/pricing");
    expect(document.title).toBe("Pricing | Priority Property Pros");
    expect(canonical()).toBe("https://prioritypropertypros.com/pricing");
    expect(
      document.head
        .querySelector('meta[name="description"]')
        ?.getAttribute("content"),
    ).toMatch(/\$9\.99/);
    expect(robots()).toBeNull();

    act(() => go("/app/admin"));
    expect(robots()).toBe("noindex");

    act(() => go("/find-a-pro/abc"));
    expect(document.title).toBe(
      "Handyman pro in Conroe | Priority Property Pros",
    );
    expect(canonical()).toBe("https://prioritypropertypros.com/find-a-pro/abc");
    expect(robots()).toBeNull();

    act(() => go("/pricing"));
    expect(document.title).toBe("Pricing | Priority Property Pros");
  });

  it("marks the not-found page noindex and clears it afterwards", () => {
    renderAt("/definitely-not-a-page");
    expect(robots()).toBe("noindex");
    expect(document.title).toBe("Page not found | Priority Property Pros");
    act(() => go("/pricing"));
    expect(robots()).toBeNull();
  });
});
