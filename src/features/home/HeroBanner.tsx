import { MarketingPhoto } from "../../components/media/MarketingPhoto";
import { MARKETING_SECTION_PHOTOS } from "../../data/marketingPhotos";
import { HERO_BANNER_FRAME_CLASS, HERO_BANNER_SIZES } from "../../lib/marketplace/heroLayout";

export function HeroBanner() {
  return (
    <figure className={HERO_BANNER_FRAME_CLASS}>
      <MarketingPhoto
        photo={MARKETING_SECTION_PHOTOS.homepageHeroBanner}
        eager
        sizes={HERO_BANNER_SIZES}
        className="h-full w-full"
      />
    </figure>
  );
}
