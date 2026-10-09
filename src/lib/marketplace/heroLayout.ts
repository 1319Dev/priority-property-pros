/** iPhone widths that must show the full hero tagline without clipping. */
export const IPHONE_LAYOUT_WIDTHS = [320, 375, 390, 393, 414, 430] as const;

export const HERO_TAGLINE = "A marketplace, not a crew";

export const HERO_ART_VIEWBOX = "0 0 280 170";

/**
 * Compact homepage house photo — copy and CTAs stay above the fold.
 * Aspect-ratio and max-height live on the same overflow box so object-cover
 * does not clip the facade from the top.
 */
export const HERO_PHOTO_FRAME_CLASS =
  "relative aspect-[16/10] max-h-[10.5rem] w-full overflow-hidden rounded-[1.5rem] border border-forest-800/10 sm:max-h-[13rem] lg:aspect-[4/3] lg:max-h-[20rem]";

export const HERO_PHOTO_OBJECT_POSITION = "center 40%";

/**
 * Official homeowners photo.
 * Phones use the native 650×312 frame so the whole picture, including faces,
 * stays in view. At lg the photo moves into a rounded card beside the copy.
 * That card is taller than the source (4/3 vs ~2.08), so object-cover trims
 * the sides only. Pinning the crop to the top keeps heads and faces in frame
 * even if the card is shorter than the photo.
 */
export const HERO_BANNER_FRAME_CLASS =
  "relative aspect-[650/312] w-full overflow-hidden bg-forest-950 lg:aspect-[4/3] lg:rounded-[1.75rem] lg:border lg:border-gold-500/40 lg:shadow-[0_24px_60px_-32px_rgba(16,36,28,0.55)]";

export const HERO_BANNER_SIZES = "(min-width: 1024px) 42vw, 100vw";

export const HERO_BANNER_OBJECT_POSITION = "center top";

export function heroTaglineFitsWidth(widthPx: number): boolean {
  return IPHONE_LAYOUT_WIDTHS.includes(widthPx as (typeof IPHONE_LAYOUT_WIDTHS)[number]) || widthPx >= 320;
}

export function heroUsesHtmlTagline(): boolean {
  return true;
}

export function heroSvgContainsTagline(svgMarkup: string): boolean {
  return /a marketplace,\s*not a crew/i.test(svgMarkup);
}
