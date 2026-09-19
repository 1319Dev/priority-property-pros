import { MARKETING_PHOTOS, type MarketingPhotoAsset, type MarketingPhotoId } from "../../data/marketingPhotos";
import { cn } from "../../utils/cn";

export function MarketingPhoto({
  photo,
  className,
  sizes,
  eager = false,
  decorative = false,
  objectPosition,
}: {
  photo: MarketingPhotoAsset | MarketingPhotoId;
  className?: string;
  sizes?: string;
  eager?: boolean;
  decorative?: boolean;
  objectPosition?: string;
}) {
  const asset = typeof photo === "string" ? MARKETING_PHOTOS[photo] : photo;
  const resolvedSizes = sizes ?? asset.defaultSizes;

  return (
    <picture className="block h-full w-full">
      {asset.sources.map((source) => (
        <source key={source.type} type={source.type} srcSet={source.srcSet} sizes={resolvedSizes} />
      ))}
      <img
        src={asset.src}
        srcSet={asset.sources.find((source) => source.type === "image/jpeg")?.srcSet}
        sizes={resolvedSizes}
        width={asset.width}
        height={asset.height}
        alt={decorative ? "" : asset.alt}
        loading={eager ? "eager" : "lazy"}
        decoding="async"
        fetchPriority={eager ? "high" : "low"}
        className={cn("h-full w-full object-cover", className)}
        style={{ objectPosition: objectPosition ?? asset.objectPosition }}
      />
    </picture>
  );
}

export function MarketingPhotoFrame({
  photo,
  className,
  frameClassName,
  sizes,
  eager = false,
  ratio = "card",
}: {
  photo: MarketingPhotoAsset | MarketingPhotoId;
  className?: string;
  frameClassName?: string;
  sizes?: string;
  eager?: boolean;
  ratio?: "hero" | "card" | "banner";
}) {
  const ratioClass =
    ratio === "hero" ? "aspect-[16/9]" : ratio === "banner" ? "aspect-[16/10]" : "aspect-[4/3]";

  return (
    <div className={cn("overflow-hidden bg-forest-800/10", ratioClass, frameClassName)}>
      <MarketingPhoto photo={photo} className={className} sizes={sizes} eager={eager} />
    </div>
  );
}
