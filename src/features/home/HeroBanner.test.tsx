import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { MARKETING_PHOTOS } from "../../data/marketingPhotos";
import { HeroBanner } from "./HeroBanner";

describe("HeroBanner", () => {
  it("renders the branded graphic at its intrinsic ratio instead of covering a cropped frame", () => {
    const { container } = render(<HeroBanner />);
    const img = screen.getByAltText(/from need to done/i);
    expect(img).toHaveClass("h-auto", "w-full", "object-contain");
    expect(img).toHaveAttribute("width", String(MARKETING_PHOTOS.brandHero.width));
    expect(img).toHaveAttribute("height", String(MARKETING_PHOTOS.brandHero.height));
    expect(img).toHaveAttribute("sizes", "100vw");
    expect(container.querySelector("figure")).toHaveClass("w-full");
  });
});
