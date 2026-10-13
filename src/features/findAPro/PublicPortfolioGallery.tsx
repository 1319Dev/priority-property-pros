import { PortfolioPhotoFrame } from "../../components/marketplace/PortfolioPhotoFrame";
import { portfolioCaptionIsPlaceholder, publicPortfolioImageUrl } from "../../lib/marketplace/publicDirectory";
import type { PublicSafePortfolioItem } from "../../lib/marketplace/publicDirectory";

export function PublicPortfolioGallery({
  items,
  limit,
  empty,
}: {
  items: PublicSafePortfolioItem[];
  limit?: number;
  empty?: string;
}) {
  const shown = typeof limit === "number" ? items.slice(0, limit) : items;
  if (shown.length === 0) {
    return empty ? <p className="mt-2 text-sm leading-relaxed text-ink-700">{empty}</p> : null;
  }
  return (
    <ul className="mt-3 grid min-w-0 grid-cols-1 gap-3 sm:grid-cols-2">
      {shown.map((item) => {
        const caption = portfolioCaptionIsPlaceholder(item.caption) ? "" : item.caption;
        return (
          <li key={item.id} className="min-w-0">
            <PortfolioPhotoFrame
              src={publicPortfolioImageUrl(item.imageUrl)}
              alt={item.caption || "Portfolio photo"}
              loading={item.imageStatus === "loading"}
            />
            {caption ? <p className="mt-2 break-words text-sm text-ink-700">{caption}</p> : null}
          </li>
        );
      })}
    </ul>
  );
}
