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
    render(<MarketingPhoto photo="house" objectPosition="center 48%" />);
    expect(screen.getByAltText(/finished suburban home/i)).toHaveStyle({ objectPosition: "center 48%" });
  });
});
