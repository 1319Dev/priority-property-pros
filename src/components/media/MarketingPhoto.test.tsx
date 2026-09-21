import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { MARKETING_PHOTOS } from "../../data/marketingPhotos";
import { MarketingPhoto } from "./MarketingPhoto";

describe("MarketingPhoto", () => {
  it("fills its frame so object-cover and object-position apply to the visible crop", () => {
    const { container } = render(<MarketingPhoto photo="house" />);
    const picture = container.querySelector("picture");
    const img = screen.getByAltText(/finished suburban home/i);
    expect(picture).toHaveClass("block", "h-full", "w-full");
    expect(img).toHaveClass("h-full", "w-full", "object-cover");
    expect(img).toHaveStyle({ objectPosition: MARKETING_PHOTOS.house.objectPosition });
  });

  it("accepts a crop-position override for the homepage hero band", () => {
    render(<MarketingPhoto photo="house" objectPosition="center 40%" />);
    expect(screen.getByAltText(/finished suburban home/i)).toHaveStyle({ objectPosition: "center 40%" });
  });

  it("renders the branded banner with object-contain so the logo and CTA bar are not cropped", () => {
    const { container } = render(<MarketingPhoto photo="brandHero" />);
    const picture = container.querySelector("picture");
    const img = screen.getByAltText(/from need to done/i);
    expect(picture).toHaveClass("block", "h-auto", "w-full");
    expect(img).toHaveClass("h-auto", "w-full", "object-contain");
    expect(img).not.toHaveClass("object-cover");
    expect(img).toHaveStyle({ objectPosition: MARKETING_PHOTOS.brandHero.objectPosition });
  });
});
