import { MarketingPhoto } from "./MarketingPhoto";
import { MARKETING_SECTION_PHOTOS } from "../../data/marketingPhotos";

/** Marketing tip only. Never insert this photo into a contractor portfolio record. */
export function PortfolioExample() {
  return (
    <figure className="mt-3 overflow-hidden rounded-3xl border border-forest-800/10 bg-cream-100">
      <div className="aspect-[455/196] w-full">
        <MarketingPhoto
          photo={MARKETING_SECTION_PHOTOS.portfolioExample}
          sizes="(max-width: 768px) 100vw, 480px"
        />
      </div>
      <figcaption className="px-4 py-3 text-sm leading-relaxed text-ink-700">
        Marketing example of a finished outdoor space. This photo is not your work, is not a customer project, and is
        not added to your portfolio. Upload your own photos when you have them.
      </figcaption>
    </figure>
  );
}
