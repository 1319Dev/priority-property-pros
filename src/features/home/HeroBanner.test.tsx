import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { MARKETING_PHOTOS } from "../../data/marketingPhotos";
import { HERO_BANNER_OBJECT_POSITION } from "../../lib/marketplace/heroLayout";
import { HeroBanner } from "./HeroBanner";

describe("HeroBanner", () => {
  it("covers the frame with the official homeowners photo and no baked headline", () => {
    const { container } = render(<HeroBanner />);
    const img = screen.getByAltText(/homeowners standing together/i);
    expect(img).toHaveClass("h-full", "w-full", "object-cover");
    expect(img).not.toHaveClass("object-contain");
    expect(img).toHaveAttribute("width", String(MARKETING_PHOTOS.homeowners.width));
    expect(img).toHaveAttribute("height", String(MARKETING_PHOTOS.homeowners.height));
    expect(img).toHaveAttribute("sizes", "(min-width: 1024px) 42vw, 100vw");
    expect(img).toHaveAttribute("loading", "eager");
    expect(img).toHaveStyle({ objectPosition: HERO_BANNER_OBJECT_POSITION });
    expect(img.getAttribute("alt")).not.toMatch(/find trusted|post a project|verified pros/i);
    expect(screen.queryByAltText(/from need to done/i)).not.toBeInTheDocument();
    expect(screen.queryByAltText(/cream-and-stone ranch/i)).not.toBeInTheDocument();
    const figure = container.querySelector("figure");
    expect(figure).toHaveClass("aspect-[650/312]", "w-full", "overflow-hidden", "lg:aspect-[4/3]", "lg:rounded-[1.75rem]");
    expect(figure).not.toHaveClass("sm:max-h-[22rem]", "lg:max-h-[26rem]");
  });
});
