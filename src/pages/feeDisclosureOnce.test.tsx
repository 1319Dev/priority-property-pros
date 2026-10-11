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

/** Refund-rule mentions in the page body, not counting the site-wide footer note. */
function refundMentions() {
  const main = document.querySelector("main");
  const text = main?.textContent ?? "";
  return (text.match(/non-refundable/gi) ?? []).length;
}

describe("fee refund wording is stated once per page", () => {
  it("states the refund rule once on /sign-up and keeps both role cards", () => {
    renderApp("/sign-up");
    expect(screen.getByRole("link", { name: /I need work done/i })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /I want to get hired/i })).toBeInTheDocument();
    expect(refundMentions()).toBe(1);
    expect(document.querySelector("main")?.textContent).toMatch(
      /\$9\.99 account activation fee and the \$4\.99 Connection Fee are generally non-refundable once delivered, except duplicate or erroneous charges, refunds required by law, or approved exceptions/i,
    );
  });

  it("states the refund rule once on /post-project", () => {
    renderApp("/post-project");
    expect(refundMentions()).toBe(1);
    expect(document.querySelector("main")?.textContent).toMatch(/one-time \$9\.99 account activation/i);
  });

  it("keeps the pricing intro plus the dedicated refund FAQ on /pricing, and nothing else", () => {
    renderApp("/pricing");
    expect(refundMentions()).toBe(2);
    expect(screen.getByText(/are the \$9\.99 activation fee and \$4\.99 connection fee refundable/i)).toBeInTheDocument();
    expect(screen.getAllByText(/does not guarantee a hire/i).length).toBeGreaterThan(0);
  });

  it("keeps the site-wide footer fee note", () => {
    renderApp("/pricing");
    expect(document.querySelector("footer")?.textContent).toMatch(/\$9\.99 one-time account activation\. Generally non-refundable/i);
  });
});

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
