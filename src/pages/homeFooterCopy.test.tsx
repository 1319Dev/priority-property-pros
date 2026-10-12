import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it } from "vitest";
import { ToastProvider } from "../components/ui/Toast";
import { OFFICIAL_CATEGORY_CARDS } from "../data/marketingPhotos";
import { AuthProvider } from "../lib/auth/AuthProvider";
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

describe("homepage and footer copy", () => {
  it("has no internal-note service card copy", () => {
    for (const card of OFFICIAL_CATEGORY_CARDS) {
      expect(card.blurb).not.toMatch(/PPP trade|PPP category|unverified/i);
    }
  });

  it("lists one Reviews link and one Trust & safety link in the footer", () => {
    renderApp("/");
    const footer = document.querySelector("footer") as HTMLElement;
    const hrefs = Array.from(footer.querySelectorAll("a")).map((a) => `${a.textContent?.trim()} ${a.getAttribute("href")}`);
    expect(hrefs.filter((h) => h.endsWith(" /reviews"))).toEqual(["Reviews /reviews"]);
    expect(hrefs.filter((h) => h.startsWith("Trust & safety"))).toEqual(["Trust & safety /trust"]);
  });

  it("does not call the reviewed-pros section 'not a directory'", () => {
    renderApp("/");
    expect(screen.queryByText(/not a directory/i)).not.toBeInTheDocument();
  });
});
