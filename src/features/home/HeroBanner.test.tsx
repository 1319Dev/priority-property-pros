import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { MARKETING_PHOTOS } from "../../data/marketingPhotos";
import { HeroBanner } from "./HeroBanner";

describe("HeroBanner", () => {
  it("covers the frame with the ranch exterior the way other property photos do", () => {
    const { container } = render(<HeroBanner />);
    const img = screen.getByAltText(/cream-and-stone ranch/i);
    expect(img).toHaveClass("h-full", "w-full", "object-cover");
    expect(img).not.toHaveClass("object-contain");
    expect(img).toHaveAttribute("width", String(MARKETING_PHOTOS.ranch.width));
    expect(img).toHaveAttribute("height", String(MARKETING_PHOTOS.ranch.height));
    expect(img).toHaveAttribute("sizes", "100vw");
    expect(img).toHaveStyle({ objectPosition: MARKETING_PHOTOS.ranch.objectPosition });
    expect(screen.queryByAltText(/from need to done/i)).not.toBeInTheDocument();
    const figure = container.querySelector("figure");
    expect(figure).toHaveClass("h-56", "w-full", "overflow-hidden");
  });
});
