import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, NavLink, Route, Routes } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";
import { ScrollToTop } from "./ScrollToTop";
import { scrollViewToTop } from "./scrollViewToTop";

describe("scrollViewToTop", () => {
  it("scrolls the window and #main to the top", () => {
    const scrollTo = vi.fn();
    window.scrollTo = scrollTo;
    const main = document.createElement("main");
    main.id = "main";
    main.scrollTop = 480;
    main.scrollTo = vi.fn();
    document.body.appendChild(main);

    scrollViewToTop();

    expect(scrollTo).toHaveBeenCalled();
    expect(main.scrollTop).toBe(0);
    expect(main.scrollTo).toHaveBeenCalled();
    main.remove();
  });

  it("scrolls to a hash target when that element exists", () => {
    const target = document.createElement("h2");
    target.id = "trust-heading";
    target.scrollIntoView = vi.fn();
    document.body.appendChild(target);

    scrollViewToTop("#trust-heading");

    expect(target.scrollIntoView).toHaveBeenCalled();
    target.remove();
  });
});

describe("ScrollToTop", () => {
  it("resets scroll when the pathname changes, including bottom-nav style links", async () => {
    const user = userEvent.setup();
    const scrollTo = vi.fn();
    window.scrollTo = scrollTo;

    render(
      <MemoryRouter initialEntries={["/"]}>
        <ScrollToTop />
        <nav>
          <NavLink to="/find-a-pro">Find</NavLink>
        </nav>
        <Routes>
          <Route path="/" element={<p>Home page</p>} />
          <Route path="/find-a-pro" element={<p>Find page</p>} />
        </Routes>
      </MemoryRouter>,
    );

    scrollTo.mockClear();
    await user.click(screen.getByRole("link", { name: /^find$/i }));
    expect(screen.getByText("Find page")).toBeInTheDocument();
    expect(scrollTo).toHaveBeenCalled();
  });
});
